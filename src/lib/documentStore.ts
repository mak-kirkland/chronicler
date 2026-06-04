/**
 * @file Shared machinery behind the JSON-document stores (`.canvas`,
 * `.timeline`): an LRU cache wrapped in a Svelte store for reactivity, a
 * per-path queue serializing the whole read→modify→write cycle, echo-suppressed
 * reload on external change, and optimistic updates with rollback on
 * disk-write failure.
 *
 * Each call to `createDocumentStore` owns its own cache, queue and echo guard,
 * so two document types never share state.
 */
import { writable, type Readable } from "svelte/store";
import { writePageContent } from "$lib/commands";
import { normalizePath, LRUCache } from "$lib/utils";
import { log } from "$lib/logger";
import { createEchoGuard } from "$lib/externalRefresh";

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
    /** Reads and parses the file; rejects if it is missing or malformed. */
    read: (path: string) => Promise<T>;
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
    read,
}: DocumentStoreOptions<T>): DocumentStore<T> {
    const cache = new LRUCache<string, CachedDocument<T>>(maxCached);
    const loaded = writable<Map<string, CachedDocument<T>>>(new Map());
    const externalReloads = writable<Map<string, number>>(new Map());
    const fileWriteQueues = new Map<string, Promise<void>>();
    const echoGuard = createEchoGuard();

    function syncStoreFromCache(): void {
        const snapshot = new Map<string, CachedDocument<T>>();
        for (const [k, v] of cache.entries()) snapshot.set(k, v);
        loaded.set(snapshot);
    }

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

    async function load(path: string, forceReload = false): Promise<T | null> {
        const normalizedPath = normalizePath(path);
        if (!forceReload) {
            const cached = cache.get(normalizedPath);
            if (cached) return cached.data;
        }
        try {
            const data = await read(normalizedPath);
            register(normalizedPath, data);
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

    /**
     * Called from worldStore when the watcher reports changed files. Reloads
     * any that are open, unless the change is an echo of our own write. The
     * reload joins the per-path write queue in both directions: it chains
     * behind an in-flight write rather than racing it, and any concurrent
     * `update` call chains behind the reload instead of racing its cache
     * commit.
     */
    function handleExternalChanges(paths: string[]): void {
        for (const p of paths) {
            const normalizedPath = normalizePath(p);
            if (!cache.get(normalizedPath)) continue; // not open
            // A write in flight means we cannot judge this event yet: the echo
            // token is only issued once the write resolves, so testing it now
            // would misread our own change as external. Chain behind the write
            // and test it there instead — dropping the event would leave the
            // cache stale and let the next local edit overwrite the real change.
            const previousTask =
                fileWriteQueues.get(normalizedPath) || Promise.resolve();
            const reloadTask = previousTask
                .catch(() => {})
                .then(() => {
                    if (echoGuard.isEcho(normalizedPath)) return null; // our own echo
                    return load(normalizedPath, true);
                })
                .then((data) => {
                    if (data === null) return; // load failure already logged
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
                try {
                    await writePageContent(
                        normalizedPath,
                        JSON.stringify(next, null, 2),
                    );
                    echoGuard.expectEcho(normalizedPath);
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
