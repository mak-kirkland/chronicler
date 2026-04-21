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
import { isMarkdown, isImage, debounce } from "./utils";
import { WORLD_UPDATE_DEBOUNCE_MS } from "./config";
import type {
    FileNode,
    TagMap,
    BrokenLink,
    BrokenImage,
    ParseError,
    PageHeader,
    IndexUpdatePayload,
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
/**
 * Describes which categories of world data need to be refreshed on the next
 * debounced load. Flags OR together across multiple backend events so nothing
 * is missed if several arrive inside one debounce window.
 */
interface PendingRefresh {
    tree: boolean;
    pages: boolean;
    media: boolean;
}

const EMPTY_REFRESH: PendingRefresh = {
    tree: false,
    pages: false,
    media: false,
};

function createWorldStore() {
    const { subscribe, set, update } = writable<WorldState>(initialState);
    let unlisten: (() => void) | null = null;

    // Accumulates across the debounce window so a single load covers every
    // payload category seen since the last refresh.
    let pending: PendingRefresh = { ...EMPTY_REFRESH };

    /**
     * Fetches only the data categories flagged in `refresh`.
     *
     * `initial=true` forces a full load regardless of flags (used for the
     * first load after `initialize`).
     */
    const loadData = async (refresh: PendingRefresh, initial = false) => {
        const fetchTree = initial || refresh.tree;
        // Tags live in page frontmatter, so only pages_changed can move them.
        const fetchTags = initial || refresh.pages;
        // Parse errors come only from markdown files.
        const fetchParseErrors = initial || refresh.pages;
        // A broken link can resolve/break when the target's existence changes
        // (structure) or when a source page's link set changes (pages).
        const fetchBrokenLinks = initial || refresh.pages || refresh.tree;
        // A broken image reference can resolve when an image appears/renames
        // (media) or when a page adds/removes an image reference (pages).
        const fetchBrokenImages = initial || refresh.pages || refresh.media;

        try {
            const [
                tags,
                brokenLinks,
                brokenImages,
                parseErrors,
                files,
                vaultPath,
            ] = await Promise.all([
                fetchTags ? getAllTags() : Promise.resolve(null),
                fetchBrokenLinks ? getAllBrokenLinks() : Promise.resolve(null),
                fetchBrokenImages
                    ? getAllBrokenImages()
                    : Promise.resolve(null),
                fetchParseErrors
                    ? getAllParseErrors()
                    : Promise.resolve(null),
                fetchTree ? getFileTree() : Promise.resolve(null),
                // The vault path is fixed for the session, so only fetch it
                // once on the initial load.
                initial ? getVaultPath() : Promise.resolve(null),
            ]);

            update((s) => {
                const newState: WorldState = {
                    ...s,
                    isLoaded: true,
                    error: null,
                };

                if (tags !== null) newState.tags = tags;
                if (brokenLinks !== null) newState.brokenLinks = brokenLinks;
                if (brokenImages !== null) newState.brokenImages = brokenImages;
                if (parseErrors !== null) newState.parseErrors = parseErrors;
                if (files !== null) newState.files = files;
                if (vaultPath !== null) newState.vaultPath = vaultPath;

                return newState;
            });
        } catch (e: any) {
            console.error("Failed to load world data:", e);
            update((s) => ({
                ...s,
                isLoaded: false,
                error: `Failed to load world data: ${e.message}`,
            }));
        }
    };

    // Create a debounced version of loadData.
    const debouncedLoadData = debounce(() => {
        const snapshot = pending;
        pending = { ...EMPTY_REFRESH };
        loadData(snapshot);
    }, WORLD_UPDATE_DEBOUNCE_MS);

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

            // Initial load fetches everything.
            await loadData(EMPTY_REFRESH, true);

            unlisten = await listen<IndexUpdatePayload>(
                "index-updated",
                (event) => {
                    // OR the payload flags into our pending refresh so the
                    // next debounced load covers every category that's been
                    // touched since the last fetch.
                    if (event.payload.structure_changed) pending.tree = true;
                    if (event.payload.pages_changed) pending.pages = true;
                    if (event.payload.media_changed) pending.media = true;

                    console.log(
                        `Index update received (structure=${event.payload.structure_changed}, pages=${event.payload.pages_changed}, media=${event.payload.media_changed}), scheduling refresh...`,
                    );
                    // When an event comes in, we don't load immediately.
                    // We wait to see if another event comes in right after.
                    debouncedLoadData();
                },
            );
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
 * Recursively flattens the file tree into a single array of all leaf nodes.
 * This runs once per tree update; all other derived stores filter this list.
 */
function flattenTree(
    node: FileNode | null,
    result: FileNode[] = [],
): FileNode[] {
    if (!node) return result;
    if (!node.children) {
        // Leaf node (file, not directory)
        result.push(node);
    } else {
        for (const child of node.children) {
            flattenTree(child, result);
        }
    }
    return result;
}

/**
 * A single derived store containing all leaf nodes from the file tree.
 * Every other lookup/list store derives from this to avoid redundant traversals.
 */
const allLeafNodes = derived(files, ($files) => flattenTree($files));

/**
 * A derived store that provides a flattened list of all page titles.
 * Useful for autocompletion features.
 */
export const allFileTitles = derived(allLeafNodes, ($nodes) =>
    $nodes
        .filter((n) => isMarkdown(n))
        .map((n) => n.name)
        .sort((a, b) => a.localeCompare(b)),
);

/**
 * A derived store that provides a flattened list of all image objects.
 * Useful for the Gallery view and image cycling.
 */
export const allImages = derived(allLeafNodes, ($nodes) =>
    $nodes
        .filter((n) => isImage(n))
        .map((n): PageHeader => ({ title: n.name, path: n.path }))
        .sort((a, b) => a.title.localeCompare(b.title)),
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

/**
 * A derived store that maps page titles (filenames) to their absolute paths.
 * Useful for resolving pin targets or wikilinks stored by name.
 * Example: { "kingdom of aethelgard": "C:/Vault/Places/Kingdom of Aethelgard.md" }
 */
export const pagePathLookup = derived(allLeafNodes, ($nodes) => {
    const map = new Map<string, string>();
    for (const n of $nodes) {
        if (isMarkdown(n)) {
            map.set(n.name.toLowerCase(), n.path);
        }
    }
    return map;
});

/**
 * A derived store that provides a flattened list of all Interactive Maps.
 * Useful for linking pins to other maps.
 */
export const allMaps = derived(allLeafNodes, ($nodes) =>
    $nodes
        .filter((n) => n.name.endsWith(".cmap"))
        .map(
            (n): PageHeader => ({
                title: n.name.replace(".cmap", ""),
                path: n.path,
            }),
        )
        .sort((a, b) => a.title.localeCompare(b.title)),
);

/**
 * A derived store that maps map titles to their absolute paths.
 * Example: { "Kingdom": "C:/Vault/Maps/Kingdom.cmap" }
 */
export const mapPathLookup = derived(allMaps, ($allMaps) => {
    const map = new Map<string, string>();
    for (const m of $allMaps) {
        map.set(m.title.toLowerCase(), m.path);
    }
    return map;
});
