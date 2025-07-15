/**
 * @file Manages persistent user settings using the Tauri Store Plugin.
 *
 * This store handles UI-related preferences that need to persist between
 * application sessions, such as whether to show a donation prompt. It uses
 * the LazyStore to avoid issues with Server-Side Rendering (SSR) by only
 * loading the data from disk when it's first accessed.
 */

import { writable } from "svelte/store";
import { LazyStore } from "@tauri-apps/plugin-store";

// Use LazyStore to prevent SSR issues. It will only load when first accessed.
const store = new LazyStore(".settings.dat");

// Create a Svelte store to hold the setting in memory for easy access.
export const hideDonationPrompt = writable<boolean>(false);

/**
 * Loads the 'hideDonationPrompt' setting from the persistent file store
 * and updates the Svelte store.
 */
export async function loadSettings() {
    const shouldHide = await store.get<boolean>("hideDonationPrompt");
    if (shouldHide) {
        hideDonationPrompt.set(shouldHide);
    }
}

/**
 * Sets the 'hideDonationPrompt' setting to true in both the persistent store
 * and the Svelte store.
 */
export async function setHideDonationPrompt() {
    hideDonationPrompt.set(true);
    await store.set("hideDonationPrompt", true);
    // Save the store to disk
    await store.save();
}
