/**
 * @file Manages the loading, caching, and safe updating of interactive maps.
 *
 * This acts as an on-demand cache for the currently viewed map and provides
 * a transactional-like API for updating map data to prevent race conditions.
 */

import { writable, get } from "svelte/store";
import {
    getMapConfig as getMapConfigFromDisk,
    writePageContent,
} from "$lib/commands";
import { normalizePath } from "$lib/utils";
import type { MapConfig } from "$lib/mapModels";

/**
 * An item in the map cache.
 */
export interface CachedMap {
    path: string;
    config: MapConfig;
    loadedAt: number;
}

// Internal store to hold loaded map configurations
// Key: Normalized absolute path
export const loadedMaps = writable<Map<string, CachedMap>>(new Map());

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
    const cache = get(loadedMaps);

    // If cached and not forcing reload, return it
    if (!forceReload && cache.has(normalizedPath)) {
        return cache.get(normalizedPath)!.config;
    }

    try {
        const config = await getMapConfigFromDisk(normalizedPath);

        loadedMaps.update((current) => {
            const newCache = new Map(current);
            newCache.set(normalizedPath, {
                path: normalizedPath,
                config,
                loadedAt: Date.now(),
            });
            return newCache;
        });

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

    loadedMaps.update((cache) => {
        const newCache = new Map(cache);
        newCache.set(normalizedPath, {
            path: normalizedPath,
            config,
            loadedAt: Date.now(),
        });
        return newCache;
    });
}

/**
 * Retrieve a specific map config from the store synchronously.
 * Only works if already loaded via `loadMapConfig` or `registerMap`.
 */
export function getMapConfig(path: string): MapConfig | null {
    const normalizedPath = normalizePath(path);
    const cache = get(loadedMaps).get(normalizedPath);
    return cache ? cache.config : null;
}

/**
 * Safely updates a map configuration.
 *
 * This function:
 * 1. Retrieves the latest config from the cache (or loads it if missing).
 * 2. Runs the provided `updateFn` to calculate the new state.
 * 3. Optimistically updates the cache immediately (for responsive UI).
 * 4. Queues the disk write to ensure it happens sequentially, preventing race conditions.
 *
 * @param path The absolute path to the map file.
 * @param updateFn A function that receives the current config and returns the updated config.
 */
export async function updateMapConfig(
    path: string,
    updateFn: (config: MapConfig) => MapConfig,
): Promise<void> {
    const normalizedPath = normalizePath(path);

    // 1. Get latest from cache or load it
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
    registerMap(normalizedPath, newConfig);

    // 4. Queue the Disk Write
    // We chain this write onto the existing promise for this file to ensure
    // writes happen in the order updateMapConfig was called.
    const previousTask =
        fileWriteQueues.get(normalizedPath) || Promise.resolve();

    const newTask = previousTask
        .catch(() => {
            // Swallow error from previous task to ensure the queue continues
        })
        .then(async () => {
            try {
                await writePageContent(
                    normalizedPath,
                    JSON.stringify(newConfig, null, 2),
                );
            } catch (e) {
                console.error(
                    `[mapStore] Write failed for ${normalizedPath}`,
                    e,
                );
                throw e;
            }
        });

    // Update the queue tail
    fileWriteQueues.set(normalizedPath, newTask);

    // We await the specific task we just created
    await newTask;
}
