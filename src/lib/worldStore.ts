/**
 * @file Manages the core application state derived from the backend.
 *
 * This file acts as the single source of truth for all data related to the
 * user's vault (files, tags, etc.). It uses a factory function (`createWorldStore`)
 * to create a managed store that handles:
 * - Asynchronous data fetching from the Rust backend.
 * - Real-time updates by listening to Tauri events (`index-updated`).
 * - Centralized error handling for data loading.
 * - A clear lifecycle (initialize, destroy) for managing the vault session.
 *
 * For UI-specific state (like view modes or modal visibility), see `viewStores.ts`.
 */

import { writable, derived } from "svelte/store";
import { listen } from "@tauri-apps/api/event";
import {
    getFileTree,
    getAllTags,
    getVaultPath,
    getAllBrokenLinks,
    getAllParseErrors,
    getAllBrokenImages,
} from "./commands";
import { isMarkdown, isImage } from "./utils";
import type {
    FileNode,
    TagMap,
    BrokenLink,
    BrokenImage,
    ParseError,
    PageHeader,
} from "./bindings";

/**
 * The shape of the core application data.
 */
export interface WorldState {
    vaultPath: string | null;
    files: FileNode | null;
    tags: TagMap;
    brokenLinks: BrokenLink[];
    brokenImages: BrokenImage[];
    parseErrors: ParseError[];
    isLoaded: boolean;
    error: string | null;
}

const initialState: WorldState = {
    vaultPath: null,
    files: null,
    tags: [],
    brokenLinks: [],
    brokenImages: [],
    parseErrors: [],
    isLoaded: false,
    error: null,
};

/**
 * A factory function to create a managed store for the application's "world" data.
 * This encapsulates asynchronous loading, error handling, and real-time updates.
 */
function createWorldStore() {
    const { subscribe, set, update } = writable<WorldState>(initialState);
    let unlisten: (() => void) | null = null;

    /**
     * Fetches all necessary data from the backend and updates the store state.
     */
    const loadData = async () => {
        try {
            // Fetch all data in parallel for efficiency.
            const [
                files,
                tags,
                vaultPath,
                brokenLinks,
                brokenImages,
                parseErrors,
            ] = await Promise.all([
                getFileTree(),
                getAllTags(),
                getVaultPath(),
                getAllBrokenLinks(),
                getAllBrokenImages(),
                getAllParseErrors(),
            ]);
            update((s) => ({
                ...s,
                files,
                tags,
                vaultPath,
                brokenLinks,
                brokenImages,
                parseErrors,
                isLoaded: true,
                error: null,
            }));
        } catch (e: any) {
            console.error("Failed to load world data:", e);
            update((s) => ({
                ...s,
                isLoaded: false,
                error: `Failed to load world data: ${e.message}`,
            }));
        }
    };

    return {
        subscribe, // so components can subscribe to the store via $
        /**
         * Initializes the store by loading data for the first time and setting up
         * the real-time event listener for backend updates.
         */
        initialize: async () => {
            // Ensure we don't set up multiple listeners
            if (unlisten) {
                unlisten();
                unlisten = null;
            }

            await loadData();

            unlisten = await listen("index-updated", () => {
                console.log(
                    "Index update received from backend, refreshing world data...",
                );
                loadData();
            });
        },
        /**
         * Resets the store to its initial state and cleans up any active listeners.
         * This should be called when the user changes or closes the vault.
         */
        destroy: () => {
            if (unlisten) {
                unlisten();
                unlisten = null;
            }
            set(initialState);
        },
    };
}

/**
 * The main, managed store for all core world data.
 * It is exported here so that the root layout component can call its
 * initialize() and destroy() methods. Other components should not import this directly.
 */
export const world = createWorldStore();

// --- Derived Stores ---
// Components should import these directly to make their data dependencies explicit.

/**
 * A derived store that only contains the vault's root path.
 */
export const vaultPath = derived(world, ($world) => $world.vaultPath);

/**
 * A derived store that only contains the file tree.
 */
export const files = derived(world, ($world) => $world.files);

/**
 * A derived store that only contains the tag map.
 */
export const tags = derived(world, ($world) => $world.tags);

/**
 * A derived store that only contains the list of broken links.
 */
export const brokenLinks = derived(world, ($world) => $world.brokenLinks);

/**
 * A derived store that only contains the list of broken image references.
 */
export const brokenImages = derived(world, ($world) => $world.brokenImages);

/**
 * A derived store that only contains the list of pages with parse errors.
 */
export const parseErrors = derived(world, ($world) => $world.parseErrors);

/**
 * A derived store that reflects the loading status of the world data.
 */
export const isWorldLoaded = derived(world, ($world) => $world.isLoaded);

/**
 * Recursively flattens the file tree into a simple array of file titles.
 * This is used to generate link suggestions for autocompletion.
 */
function flattenFileTree(node: FileNode | null): string[] {
    if (!node) return [];
    const titles: string[] = [];
    if (node.name && isMarkdown(node)) {
        // Extract title from path, removing extension
        titles.push(node.name);
    }
    if (node.children) {
        for (const child of node.children) {
            titles.push(...flattenFileTree(child));
        }
    }
    return titles;
}

/**
 * Recursively flattens the file tree to find all image files.
 * Returns PageHeader objects.
 */
function flattenImageTree(node: FileNode | null): PageHeader[] {
    if (!node) return [];
    const images: PageHeader[] = [];
    if (node.name && isImage(node)) {
        images.push({ title: node.name, path: node.path });
    }
    if (node.children) {
        for (const child of node.children) {
            images.push(...flattenImageTree(child));
        }
    }
    return images;
}

/**
 * A derived store that provides a flattened list of all page titles.
 * Useful for autocompletion features.
 */
export const allFileTitles = derived(files, ($files) =>
    flattenFileTree($files),
);

/**
 * A derived store that provides a flattened list of all image objects.
 * Useful for the Gallery view and image cycling.
 */
export const allImages = derived(files, ($files) =>
    flattenImageTree($files).sort((a, b) => a.title.localeCompare(b.title)),
);

/**
 * A helper derived store for just filenames, kept for compatibility with existing autocomplete.
 */
export const allImageFiles = derived(allImages, ($allImages) =>
    $allImages.map((img) => img.title),
);

/**
 * A derived store that maps image filenames to their absolute paths.
 * Example: { "my-image.png": "C:/Vault/Assets/my-image.png" }
 */
export const imagePathLookup = derived(allImages, ($allImages) => {
    const map = new Map<string, string>();
    for (const img of $allImages) {
        // Normalize keys to lowercase to match backend behavior
        map.set(img.title.toLowerCase(), img.path);
    }
    return map;
});
