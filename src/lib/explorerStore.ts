/**
 * @file Manages the UI state for the file explorer.
 * @summary This store holds a Set of paths corresponding to directories
 * that the user has manually expanded. By centralizing this state,
 * it persists across searches and re-renders, decoupling it from the
 * FileTree component's lifecycle.
 */

import { writable } from "svelte/store";

/**
 * Creates a custom store to manage the set of expanded directory paths.
 * This pattern encapsulates the store's logic (adding/removing paths).
 * @returns A store object with subscribe and toggle methods.
 */
function createExpandedPathsStore() {
    const { subscribe, update } = writable(new Set<string>());

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
    };
}

/**
 * The exported store instance for managing manually expanded paths in the file explorer.
 */
export const manuallyExpandedPaths = createExpandedPathsStore();
