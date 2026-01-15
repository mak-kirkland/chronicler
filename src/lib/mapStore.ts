/**
 * @file Manages the loading, parsing, and indexing of interactive maps.
 *
 * This store subscribes to the `files` store from `worldStore` to detect
 * when .map.json files are added or changed. It then reads those files
 * from disk and builds a reverse index (pinsByPage) to allow the "View on Map" feature.
 */

import { writable, derived, get } from "svelte/store";
import { files as fileTree } from "$lib/worldStore";
import { readTextFile } from "$lib/commands";
import { normalizePath } from "$lib/utils";
import type { MapConfig, MapPin } from "$lib/mapModels";
import type { FileNode } from "$lib/bindings";

/**
 * An item in the map cache.
 */
interface CachedMap {
    path: string;
    config: MapConfig;
    loadedAt: number;
}

// Internal store to hold loaded map configurations
export const loadedMaps = writable<Map<string, CachedMap>>(new Map());

/**
 * A derived store that provides a reverse index:
 * Key: Absolute path of a Markdown page.
 * Value: Array of map locations where this page is pinned.
 */
export const mapPinsByPage = derived(loadedMaps, ($loadedMaps) => {
    const index = new Map<string, { mapPath: string; mapTitle: string; pin: MapPin }[]>();

    for (const [mapPath, cache] of $loadedMaps.entries()) {
        if (!cache.config.pins) continue;

        for (const pin of cache.config.pins) {
            if (pin.targetPage) {
                // Key by lowercase title for case-insensitive matching
                const key = pin.targetPage.toLowerCase();
                const existing = index.get(key) || [];
                existing.push({
                    mapPath,
                    mapTitle: cache.config.title,
                    pin,
                });
                index.set(key, existing);
            }
        }
    }
    return index;
});

// Helper: Recursively find all .map.json files in the file tree
function findMapFiles(node: FileNode): string[] {
    let results: string[] = [];
    if (node.name.endsWith(".map.json")) {
        // Ensure we normalize paths from the tree to match frontend expectations
        results.push(normalizePath(node.path));
    }
    if (node.children) {
        for (const child of node.children) {
            results.push(...findMapFiles(child));
        }
    }
    return results;
}

// --- Logic to sync maps with file system ---

let processedFileHash = "";

// Subscribe to file tree changes to reload maps when necessary
fileTree.subscribe(async (root) => {
    if (!root) {
        return;
    }

    // Simple hash check to avoid re-scanning if tree structure hasn't effectively changed
    const currentHash = JSON.stringify(root);
    if (currentHash === processedFileHash) {
        return;
    }
    processedFileHash = currentHash;

    const mapPaths = findMapFiles(root);
    const currentCache = get(loadedMaps);
    const newCache = new Map(currentCache);

    // 1. Remove maps that no longer exist
    for (const cachedPath of currentCache.keys()) {
        if (!mapPaths.includes(cachedPath)) {
            newCache.delete(cachedPath);
        }
    }

    // 2. Load new or updated maps
    for (const path of mapPaths) {
        // Optimization: In a real app, check timestamps.
        // For now, we reload if it's not in cache or if we suspect it might have changed.
        // To be safe and simple, we'll reload if not present.
        // If it IS present, we might want to reload it anyway if the hash changed (which implies *something* changed).
        // Let's just reload them all for robustness in this phase.

        try {
            const content = await readTextFile(path);
            const config = JSON.parse(content) as MapConfig;
            newCache.set(path, {
                path,
                config,
                loadedAt: Date.now(),
            });
        } catch (e) {
            console.error(`[mapStore] Failed to load map at ${path}:`, e);
        }
    }

    loadedMaps.set(newCache);
});

/**
 * Manually registers a map in the cache immediately.
 * This is used when creating a new map to ensure it's available before the
 * file system watcher has a chance to catch up.
 */
export function registerMap(path: string, config: MapConfig) {
    const normalizedPath = normalizePath(path);

    loadedMaps.update(cache => {
        const newCache = new Map(cache);
        newCache.set(normalizedPath, {
            path: normalizedPath,
            config,
            loadedAt: Date.now()
        });
        return newCache;
    });
}

/**
 * Retrieve a specific map config from the store.
 */
export function getMapConfig(path: string): MapConfig | null {
    const cache = get(loadedMaps).get(path);
    return cache ? cache.config : null;
}
