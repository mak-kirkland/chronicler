/**
 * @file Manages the loading, caching, and safe updating of interactive maps.
 *
 * This acts as an on-demand cache for the currently viewed map and provides
 * a transactional-like API for updating map data to prevent race conditions.
 *
 * Also manages tile pyramid metadata for map layer images — tiles are
 * generated lazily on first access and cached per image hash.
 * Tile readiness is surfaced through a reactive Svelte store so that
 * components automatically re-render when tiles become available.
 */

import { writable, get } from "svelte/store";
import {
    getMapConfig as getMapConfigFromDisk,
    writePageContent,
    ensureLayerTiles,
    lookupLayerTileInfo,
} from "$lib/commands";
import { normalizePath, LRUCache } from "$lib/utils";
import { MAX_CACHED_MAPS } from "$lib/config";
import type { MapConfig } from "$lib/mapModels";
import type { TileSetInfo } from "$lib/mapModels";

/**
 * An item in the map cache.
 */
export interface CachedMap {
    path: string;
    config: MapConfig;
    loadedAt: number;
}

// Internal LRU cache for map configurations.
// Svelte store wraps it so components can reactively subscribe.
const mapCache = new LRUCache<string, CachedMap>(MAX_CACHED_MAPS);

// Reactive store — updated whenever the LRU cache changes so subscribers re-render.
export const loadedMaps = writable<Map<string, CachedMap>>(new Map());

/**
 * Syncs the LRU cache contents into the Svelte store for reactivity.
 */
function syncStoreFromCache(): void {
    const snapshot = new Map<string, CachedMap>();
    for (const [k, v] of mapCache.entries()) {
        snapshot.set(k, v);
    }
    loadedMaps.set(snapshot);
}

// A map of write queues for each file path.
// This ensures that save operations for a specific file happen strictly in order.
const fileWriteQueues = new Map<string, Promise<void>>();

/**
 * Loads a map configuration from disk if not already cached.
 * Returns the cached version immediately if available.
 */
export async function loadMapConfig(
    path: string,
    forceReload = false,
): Promise<MapConfig | null> {
    const normalizedPath = normalizePath(path);

    // If cached and not forcing reload, return it (also promotes in LRU)
    if (!forceReload) {
        const cached = mapCache.get(normalizedPath);
        if (cached) return cached.config;
    }

    try {
        const config = await getMapConfigFromDisk(normalizedPath);

        mapCache.set(normalizedPath, {
            path: normalizedPath,
            config,
            loadedAt: Date.now(),
        });
        syncStoreFromCache();

        return config;
    } catch (e) {
        console.error(`[mapStore] Failed to load map at ${normalizedPath}:`, e);
        return null;
    }
}

/**
 * Manually registers a map in the cache immediately.
 * This is used when creating a new map or updating one via the Map Console
 * to ensure the UI reflects changes instantly without waiting for disk I/O.
 */
export function registerMap(path: string, config: MapConfig) {
    const normalizedPath = normalizePath(path);

    mapCache.set(normalizedPath, {
        path: normalizedPath,
        config,
        loadedAt: Date.now(),
    });
    syncStoreFromCache();
}

/**
 * Retrieve a specific map config from the store synchronously.
 * Only works if already loaded via `loadMapConfig` or `registerMap`.
 */
export function getMapConfig(path: string): MapConfig | null {
    const normalizedPath = normalizePath(path);
    const cached = mapCache.get(normalizedPath);
    return cached ? cached.config : null;
}

/**
 * Safely updates a map configuration.
 *
 * This function serializes the entire read → modify → write cycle per file path,
 * ensuring that concurrent calls to updateMapConfig for the same path don't
 * interleave their read-modify-update of the in-memory cache.
 *
 * Flow:
 * 1. Waits for any in-flight update for this path to complete.
 * 2. Retrieves the latest config from the cache (or loads it if missing).
 * 3. Runs the provided `updateFn` to calculate the new state.
 * 4. Updates the cache immediately (for responsive UI).
 * 5. Writes to disk.
 *
 * @param path The absolute path to the map file.
 * @param updateFn A function that receives the current config and returns the updated config.
 */
export async function updateMapConfig(
    path: string,
    updateFn: (config: MapConfig) => MapConfig,
): Promise<void> {
    const normalizedPath = normalizePath(path);

    // Chain onto the existing queue for this path so the entire
    // read-modify-write cycle is serialized — not just the disk write.
    const previousTask =
        fileWriteQueues.get(normalizedPath) || Promise.resolve();

    const newTask = previousTask
        .catch(() => {
            // Swallow error from previous task to keep the queue alive
        })
        .then(async () => {
            // 1. Get latest from cache or load it (inside the serialized block)
            let currentConfig = getMapConfig(normalizedPath);
            if (!currentConfig) {
                currentConfig = await loadMapConfig(normalizedPath);
            }

            if (!currentConfig) {
                throw new Error(
                    `Cannot update map: Config not found for ${normalizedPath}`,
                );
            }

            // 2. Calculate new state
            const newConfig = updateFn(currentConfig);

            // 3. Optimistic Update: Update store immediately so UI reflects changes
            const previousConfig = currentConfig;
            registerMap(normalizedPath, newConfig);

            // 4. Write to disk — rollback on failure
            try {
                await writePageContent(
                    normalizedPath,
                    JSON.stringify(newConfig, null, 2),
                );
            } catch (e) {
                console.error(
                    `[mapStore] Write failed for ${normalizedPath}, rolling back.`,
                    e,
                );
                registerMap(normalizedPath, previousConfig);
                throw e;
            }
        })
        .finally(() => {
            // Clean up the queue entry once this task is the tail and has settled
            if (fileWriteQueues.get(normalizedPath) === newTask) {
                fileWriteQueues.delete(normalizedPath);
            }
        });

    // Update the queue tail
    fileWriteQueues.set(normalizedPath, newTask);

    // We await the specific task we just created
    await newTask;
}

// ---------------------------------------------------------------------------
// Tile Pyramid Cache  (reactive, single source of truth)
// ---------------------------------------------------------------------------

/**
 * Reactive store of tile set info, keyed by image filename (lowercase).
 *
 * This is the **single source of truth** for tile metadata. Components
 * subscribe to it for reactive updates; non-reactive code paths use
 * `get(tileInfoStore)` for synchronous lookups (an O(1) operation).
 */
export const tileInfoStore = writable<Map<string, TileSetInfo>>(new Map());

/**
 * In-flight tile generation promises, keyed by image filename (lowercase).
 * Prevents duplicate concurrent requests for the same image.
 */
const tileInfoPending = new Map<string, Promise<TileSetInfo | null>>();

/**
 * Returns tile set info for a map layer image, generating tiles if needed.
 *
 * - If cached in the store, returns immediately.
 * - If already being generated, returns the same pending promise (deduplication).
 * - Otherwise, calls the backend `ensure_layer_tiles` command.
 *
 * When tile generation completes, the reactive `tileInfoStore` is updated
 * so any subscribed component re-renders automatically.
 *
 * @param imageFilename The image filename from MapLayer.image
 * @returns The tile set info, or null if tile generation failed.
 */
export async function getLayerTileInfo(
    imageFilename: string,
): Promise<TileSetInfo | null> {
    const key = imageFilename.toLowerCase();

    // 1. Already cached in the store?
    const cached = get(tileInfoStore).get(key);
    if (cached) return cached;

    // 2. Already in flight?
    const pending = tileInfoPending.get(key);
    if (pending) return pending;

    // 3. Start generation
    const promise = ensureLayerTiles(imageFilename)
        .then((info) => {
            tileInfoStore.update((m) => {
                const next = new Map(m);
                next.set(key, info);
                return next;
            });
            return info;
        })
        .catch((e) => {
            console.error(
                `[mapStore] Tile generation failed for ${imageFilename}:`,
                e,
            );
            return null;
        })
        .finally(() => {
            tileInfoPending.delete(key);
        });

    tileInfoPending.set(key, promise);
    return promise;
}

/**
 * Read-only cache lookup. Resolves to the cached `TileSetInfo` if the
 * pyramid is already on disk, or `null` if generation would be required.
 *
 * Used by the map view to decide whether to mount the tiled `GridLayer`
 * directly (cache hit) or briefly fall back to the original image while
 * generation runs (cache miss). Updates `tileInfoStore` on a hit so the
 * normal reactive flow takes over from there.
 */
export async function lookupTileInfo(
    imageFilename: string,
): Promise<TileSetInfo | null> {
    const key = imageFilename.toLowerCase();

    const cached = get(tileInfoStore).get(key);
    if (cached) return cached;

    const info = await lookupLayerTileInfo(imageFilename);
    if (info) {
        tileInfoStore.update((m) => {
            const next = new Map(m);
            next.set(key, info);
            return next;
        });
    }
    return info;
}
