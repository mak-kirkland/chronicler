/**
 * @file Manages the loading and caching of interactive maps.
 *
 * This acts as an on-demand cache for the currently viewed map.
 */

import { writable, get } from "svelte/store";
import { getMapConfig as getMapConfigFromDisk } from "$lib/commands";
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
