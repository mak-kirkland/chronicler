/**
 * @file Loading, caching, and safe serialized updating of `.timeline` files.
 * Mirrors canvasStore.ts: an LRU cache wrapped in a Svelte store for
 * reactivity, a per-path write queue serializing the whole
 * read→modify→write cycle, and optimistic updates with rollback on
 * disk-write failure.
 */
import { writable } from "svelte/store";
import { getTimelineData, writePageContent } from "$lib/commands";
import { normalizePath, LRUCache } from "$lib/utils";
import { MAX_CACHED_TIMELINES } from "$lib/config";
import { log } from "$lib/logger";
import type { TimelineData } from "$lib/timelineModels";

export interface CachedTimeline {
    path: string;
    data: TimelineData;
    loadedAt: number;
}

const timelineCache = new LRUCache<string, CachedTimeline>(
    MAX_CACHED_TIMELINES,
);

/** Reactive snapshot of the cache so components re-render on change. */
export const loadedTimelines = writable<Map<string, CachedTimeline>>(new Map());

function syncStoreFromCache(): void {
    const snapshot = new Map<string, CachedTimeline>();
    for (const [k, v] of timelineCache.entries()) snapshot.set(k, v);
    loadedTimelines.set(snapshot);
}

const fileWriteQueues = new Map<string, Promise<void>>();

export async function loadTimelineData(
    path: string,
    forceReload = false,
): Promise<TimelineData | null> {
    const normalizedPath = normalizePath(path);
    if (!forceReload) {
        const cached = timelineCache.get(normalizedPath);
        if (cached) return cached.data;
    }
    try {
        const data = await getTimelineData(normalizedPath);
        timelineCache.set(normalizedPath, {
            path: normalizedPath,
            data,
            loadedAt: Date.now(),
        });
        syncStoreFromCache();
        return data;
    } catch (e) {
        log.error(
            `Failed to load timeline at ${normalizedPath}`,
            e,
            "timelineStore",
        );
        return null;
    }
}

/** Register a timeline in the cache immediately (e.g. on create / optimistic). */
export function registerTimeline(path: string, data: TimelineData): void {
    const normalizedPath = normalizePath(path);
    timelineCache.set(normalizedPath, {
        path: normalizedPath,
        data,
        loadedAt: Date.now(),
    });
    syncStoreFromCache();
}

export function getTimelineFromCache(path: string): TimelineData | null {
    const cached = timelineCache.get(normalizePath(path));
    return cached ? cached.data : null;
}

/**
 * Serializes the entire read→modify→write cycle per path. Applies the update
 * optimistically to the cache, writes JSON to disk, and rolls back on failure.
 */
export async function updateTimeline(
    path: string,
    updateFn: (data: TimelineData) => TimelineData,
): Promise<void> {
    const normalizedPath = normalizePath(path);
    const previousTask =
        fileWriteQueues.get(normalizedPath) || Promise.resolve();

    const newTask = previousTask
        .catch(() => {})
        .then(async () => {
            let current = getTimelineFromCache(normalizedPath);
            if (!current) current = await loadTimelineData(normalizedPath);
            if (!current) {
                throw new Error(
                    `Cannot update timeline: data not found for ${normalizedPath}`,
                );
            }
            const next = updateFn(current);
            const previous = current;
            registerTimeline(normalizedPath, next);
            try {
                await writePageContent(
                    normalizedPath,
                    JSON.stringify(next, null, 2),
                );
            } catch (e) {
                log.error(
                    `Write failed for ${normalizedPath}, rolling back.`,
                    e,
                    "timelineStore",
                );
                registerTimeline(normalizedPath, previous);
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
