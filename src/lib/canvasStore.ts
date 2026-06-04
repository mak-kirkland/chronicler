/**
 * @file Loading, caching, and safe serialized updating of `.canvas` files.
 * Mirrors mapStore.ts: an LRU cache wrapped in a Svelte store for reactivity,
 * a per-path write queue serializing the whole read→modify→write cycle, and
 * optimistic updates with rollback on disk-write failure.
 */
import { writable } from "svelte/store";
import { getCanvasData, writePageContent } from "$lib/commands";
import { normalizePath, LRUCache } from "$lib/utils";
import { MAX_CACHED_CANVASES } from "$lib/config";
import { log } from "$lib/logger";
import { createEchoGuard } from "$lib/externalRefresh";
import type { CanvasData } from "$lib/canvasModels";

export interface CachedCanvas {
    path: string;
    data: CanvasData;
    loadedAt: number;
}

const canvasCache = new LRUCache<string, CachedCanvas>(MAX_CACHED_CANVASES);

/** Reactive snapshot of the cache so components re-render on change. */
export const loadedCanvases = writable<Map<string, CachedCanvas>>(new Map());

function syncStoreFromCache(): void {
    const snapshot = new Map<string, CachedCanvas>();
    for (const [k, v] of canvasCache.entries()) snapshot.set(k, v);
    loadedCanvases.set(snapshot);
}

const fileWriteQueues = new Map<string, Promise<void>>();

const echoGuard = createEchoGuard();

/** path → count of completed external reloads; views watch this to clear
 *  their undo history (undoing across an external edit would resurrect a
 *  stale tree). */
export const externalReloads = writable<Map<string, number>>(new Map());

/**
 * Called from worldStore when the watcher reports changed .canvas files.
 * Reloads any that are open, unless the change is an echo of our own write.
 * The reload is itself registered in the write queue, so any concurrent
 * `updateCanvas` call chains behind it instead of racing its cache commit.
 */
export function handleExternalChanges(paths: string[]): void {
    for (const p of paths) {
        const normalizedPath = normalizePath(p);
        if (!canvasCache.get(normalizedPath)) continue; // not open
        if (fileWriteQueues.has(normalizedPath)) continue; // our write in flight
        if (echoGuard.isEcho(normalizedPath)) continue; // our own echo
        const reloadTask = loadCanvasData(normalizedPath, true)
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

export async function loadCanvasData(
    path: string,
    forceReload = false,
): Promise<CanvasData | null> {
    const normalizedPath = normalizePath(path);
    if (!forceReload) {
        const cached = canvasCache.get(normalizedPath);
        if (cached) return cached.data;
    }
    try {
        const data = await getCanvasData(normalizedPath);
        canvasCache.set(normalizedPath, {
            path: normalizedPath,
            data,
            loadedAt: Date.now(),
        });
        syncStoreFromCache();
        return data;
    } catch (e) {
        log.error(
            `Failed to load canvas at ${normalizedPath}`,
            e,
            "canvasStore",
        );
        return null;
    }
}

/** Register a canvas in the cache immediately (e.g. on create / optimistic). */
export function registerCanvas(path: string, data: CanvasData): void {
    const normalizedPath = normalizePath(path);
    canvasCache.set(normalizedPath, {
        path: normalizedPath,
        data,
        loadedAt: Date.now(),
    });
    syncStoreFromCache();
}

export function getCanvasFromCache(path: string): CanvasData | null {
    const cached = canvasCache.get(normalizePath(path));
    return cached ? cached.data : null;
}

/**
 * Serializes the entire read→modify→write cycle per path. Applies the update
 * optimistically to the cache, writes JSON to disk, and rolls back on failure.
 */
export async function updateCanvas(
    path: string,
    updateFn: (data: CanvasData) => CanvasData,
): Promise<void> {
    const normalizedPath = normalizePath(path);
    const previousTask =
        fileWriteQueues.get(normalizedPath) || Promise.resolve();

    const newTask = previousTask
        .catch(() => {})
        .then(async () => {
            let current = getCanvasFromCache(normalizedPath);
            if (!current) current = await loadCanvasData(normalizedPath);
            if (!current) {
                throw new Error(
                    `Cannot update canvas: data not found for ${normalizedPath}`,
                );
            }
            const next = updateFn(current);
            const previous = current;
            registerCanvas(normalizedPath, next);
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
                    "canvasStore",
                );
                registerCanvas(normalizedPath, previous);
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
