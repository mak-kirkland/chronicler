/**
 * @file Manages the UI state for the file explorer.
 * @summary This store holds a Set of paths corresponding to directories
 * that the user has manually expanded, as well as view preferences like
 * showing/hiding images.
 */

import { writable } from "svelte/store";

/**
 * Creates a custom store to manage the set of expanded directory paths.
 * This pattern encapsulates the store's logic (adding/removing paths).
 * @returns A store object with subscribe, toggle, and collapseAll methods.
 */
function createExpandedPathsStore() {
    // Destructure 'set' so we can use it for collapseAll
    const { subscribe, update, set } = writable(new Set<string>());

    return {
        /**
         * The standard Svelte store subscribe method.
         */
        subscribe,

        /**
         * Toggles the expansion state of a given path in the set.
         * @param {string} path - The full path of the directory to add or remove.
         */
        toggle: (path: string) => {
            update((currentSet) => {
                // Create a new set for immutability, which is good practice.
                const newSet = new Set(currentSet);
                if (newSet.has(path)) {
                    newSet.delete(path);
                } else {
                    newSet.add(path);
                }
                return newSet;
            });
        },

        /**
         * Clears all expanded paths, effectively collapsing all directories
         * in the file explorer view.
         */
        collapseAll: () => {
            set(new Set());
        },
    };
}

/**
 * The exported store instance for managing manually expanded paths in the file explorer.
 */
export const manuallyExpandedPaths = createExpandedPathsStore();

/**
 * Store to control the visibility of image files in the file explorer.
 * Default is true (images are shown).
 */
export const showImages = writable(true);
