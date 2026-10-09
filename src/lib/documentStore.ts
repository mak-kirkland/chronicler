/**
 * @file Shared machinery behind the JSON-document stores (`.canvas`,
 * `.timeline`): an LRU cache wrapped in a Svelte store for reactivity, a
 * per-path queue serializing the whole read→modify→write cycle, reload on
 * external change (ignoring our own writes coming back), and optimistic
 * updates with rollback on disk-write failure.
 *
 * Each call to `createDocumentStore` owns its own cache, queue and record of
 * file contents, so two document types never share state.
 */
import { writable, type Readable } from "svelte/store";
import { writePageContent } from "$lib/commands";
import { normalizePath, LRUCache } from "$lib/utils";
import { log } from "$lib/logger";

export interface CachedDocument<T> {
    path: string;
    data: T;
    loadedAt: number;
}

export interface DocumentStoreOptions<T> {
    /** Noun for log and error messages, e.g. `"canvas"`. */
    noun: string;
    /** Log context tag, e.g. `"canvasStore"`. */
    context: string;
    maxCached: number;
    /** Reads the file's raw text; rejects if it is missing. */
    readText: (path: string) => Promise<string>;
    /** Parses that text; throws if it is malformed. */
    parse: (text: string) => T;
}

export interface DocumentStore<T> {
    /** Reactive snapshot of the cache so components re-render on change. */
    loaded: Readable<Map<string, CachedDocument<T>>>;
    /** path → count of completed external reloads; views watch this to clear
     *  their undo history (undoing across an external edit would resurrect a
     *  stale tree). */
    externalReloads: Readable<Map<string, number>>;
    handleExternalChanges(paths: string[]): void;
    load(path: string, forceReload?: boolean): Promise<T | null>;
    /** Put data in the cache immediately (e.g. on create / optimistic). */
    register(path: string, data: T): void;
    fromCache(path: string): T | null;
    update(path: string, updateFn: (data: T) => T): Promise<void>;
}

export function createDocumentStore<T>({
    noun,
    context,
    maxCached,
    readText,
    parse,
}: DocumentStoreOptions<T>): DocumentStore<T> {
    const cache = new LRUCache<string, CachedDocument<T>>(maxCached);
    const loaded = writable<Map<string, CachedDocument<T>>>(new Map());
    const externalReloads = writable<Map<string, number>>(new Map());
    const fileWriteQueues = new Map<string, Promise<void>>();
    /** path → the file's text as we last read or wrote it. A watcher event
     *  for a file that still holds this text is our own write coming back
     *  (or a touch that changed nothing), so it doesn't reload. */
    const diskText = new Map<string, string>();

    function syncStoreFromCache(): void {
        const snapshot = new Map<string, CachedDocument<T>>();
        for (const [k, v] of cache.entries()) snapshot.set(k, v);
        // Forget the text of documents the LRU has evicted.
        for (const p of diskText.keys()) {
            if (!snapshot.has(p)) diskText.delete(p);
        }
        loaded.set(snapshot);
    }

    /** Cache only: `diskText` tracks the file, which this doesn't touch
     *  (canvas drag previews register on every pointer move). */
    function register(path: string, data: T): void {
        const normalizedPath = normalizePath(path);
        cache.set(normalizedPath, {
            path: normalizedPath,
            data,
            loadedAt: Date.now(),
        });
        syncStoreFromCache();
    }

    function fromCache(path: string): T | null {
        const cached = cache.get(normalizePath(path));
        return cached ? cached.data : null;
    }

    /**
     * Reads, parses and caches the file. Returns null if that fails (logged)
     * or, with `onlyIfChanged`, if the file still holds the text we last
     * read or wrote.
     */
    async function readFromDisk(
        normalizedPath: string,
        onlyIfChanged = false,
    ): Promise<T | null> {
        try {
            const text = await readText(normalizedPath);
            if (onlyIfChanged && text === diskText.get(normalizedPath)) {
                return null;
            }
            const data = parse(text);
            register(normalizedPath, data);
            diskText.set(normalizedPath, text);
            return data;
        } catch (e) {
            log.error(
                `Failed to load ${noun} at ${normalizedPath}`,
                e,
                context,
            );
            return null;
        }
    }

    async function load(path: string, forceReload = false): Promise<T | null> {
        const normalizedPath = normalizePath(path);
        if (!forceReload) {
            const cached = cache.get(normalizedPath);
            if (cached) return cached.data;
        }
        return readFromDisk(normalizedPath);
    }

    /**
     * Called from worldStore when the watcher reports changed files. Reloads
     * any that are open whose text on disk differs from what we last read or
     * wrote. Comparing content (rather than counting our writes) matters
     * because the watcher coalesces: one event can stand for several of our
     * saves, and a count would leave stale entries that swallow the next
     * real edit. The reload joins the per-path write queue in both
     * directions: it chains behind an in-flight write, so the disk is judged
     * only once that write has landed, and any concurrent `update` call
     * chains behind the reload instead of racing its cache commit.
     */
    function handleExternalChanges(paths: string[]): void {
        for (const p of paths) {
            const normalizedPath = normalizePath(p);
            if (!cache.get(normalizedPath)) continue; // not open
            const previousTask =
                fileWriteQueues.get(normalizedPath) || Promise.resolve();
            const reloadTask = previousTask
                .catch(() => {})
                .then(() => readFromDisk(normalizedPath, true))
                .then((data) => {
                    if (data === null) return; // unchanged, or failed (logged)
                    externalReloads.update((m) => {
                        const next = new Map(m);
                        next.set(
                            normalizedPath,
                            (next.get(normalizedPath) ?? 0) + 1,
                        );
                        return next;
                    });
                })
                .finally(() => {
                    if (fileWriteQueues.get(normalizedPath) === reloadTask) {
                        fileWriteQueues.delete(normalizedPath);
                    }
                });
            fileWriteQueues.set(normalizedPath, reloadTask);
        }
    }

    /**
     * Serializes the entire read→modify→write cycle per path. Applies the
     * update optimistically to the cache, writes JSON to disk, and rolls back
     * on failure.
     */
    async function update(
        path: string,
        updateFn: (data: T) => T,
    ): Promise<void> {
        const normalizedPath = normalizePath(path);
        const previousTask =
            fileWriteQueues.get(normalizedPath) || Promise.resolve();

        const newTask = previousTask
            .catch(() => {})
            .then(async () => {
                let current = fromCache(normalizedPath);
                if (!current) current = await load(normalizedPath);
                if (!current) {
                    throw new Error(
                        `Cannot update ${noun}: data not found for ${normalizedPath}`,
                    );
                }
                const next = updateFn(current);
                const previous = current;
                register(normalizedPath, next);
                const json = JSON.stringify(next, null, 2);
                try {
                    await writePageContent(normalizedPath, json);
                    diskText.set(normalizedPath, json);
                } catch (e) {
                    log.error(
                        `Write failed for ${normalizedPath}, rolling back.`,
                        e,
                        context,
                    );
                    register(normalizedPath, previous);
                    throw e;
                }
            })
            .finally(() => {
                if (fileWriteQueues.get(normalizedPath) === newTask) {
                    fileWriteQueues.delete(normalizedPath);
                }
            });

        fileWriteQueues.set(normalizedPath, newTask);
        await newTask;
    }

    return {
        loaded: { subscribe: loaded.subscribe },
        externalReloads: { subscribe: externalReloads.subscribe },
        handleExternalChanges,
        load,
        register,
        fromCache,
        update,
    };
}
