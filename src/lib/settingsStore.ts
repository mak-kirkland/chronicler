/**
 * @file Manages persistent user settings using the Tauri Store Plugin.
 *
 * This store handles UI-related preferences that need to persist between
 * application sessions. It uses the LazyStore to avoid issues with
 * Server-Side Rendering (SSR) by only loading the data from disk when
 * it's first accessed.
 */

import { writable, get } from "svelte/store";
import { LazyStore } from "@tauri-apps/plugin-store";

// --- Type Definitions ---

/** Defines the shape of the entire settings object saved to disk. */
interface AppSettings {
    hideDonationPrompt: boolean;
    activeTheme: ThemeName;
    fontSize: number;
    userThemes: CustomTheme[];
}

export type ThemeName = string;

/** Defines the shape of a single theme's color palette using semantic variable names. */
export interface ThemePalette {
    "--color-background-primary": string;
    "--color-background-secondary": string;
    "--color-background-tertiary": string;
    "--color-text-heading": string;
    "--color-text-primary": string;
    "--color-text-secondary": string;
    "--color-border-primary": string;
    "--color-accent-primary": string;
    "--color-text-link": string;
    "--color-text-link-broken": string;
    "--color-text-error": string;
}

/**
 * The canonical list of CSS variables that make up a theme palette.
 * This is the single source of truth for the application, ensuring that all
 * components (theme editor, global layout, etc.) use the same set of keys.
 */
export const THEME_PALETTE_KEYS: (keyof ThemePalette)[] = [
    "--color-background-primary",
    "--color-background-secondary",
    "--color-background-tertiary",
    "--color-text-heading",
    "--color-text-primary",
    "--color-text-secondary",
    "--color-border-primary",
    "--color-accent-primary",
    "--color-text-link",
    "--color-text-link-broken",
    "--color-text-error",
];

/** Defines a full theme object, including its name and palette. */
export interface CustomTheme {
    name: ThemeName; // Changed from string to ThemeName for consistency
    palette: ThemePalette;
}

// --- Store Initialization ---

// Use LazyStore to prevent SSR issues. It will only load when first accessed.
const settingsFile = new LazyStore(".settings.dat");

// Create Svelte stores to hold settings in memory for easy, reactive access.
// We provide sensible defaults for first-time users.
export const hideDonationPrompt = writable<boolean>(false);
export const activeTheme = writable<ThemeName>("light");
export const fontSize = writable<number>(100);
export const userThemes = writable<CustomTheme[]>([]);

// --- Public API ---

/**
 * Loads all settings from the persistent file store into the reactive Svelte stores.
 * This should be called once when the application initializes.
 */
export async function loadSettings() {
    const settings = await settingsFile.get<AppSettings>("allSettings");
    if (settings) {
        hideDonationPrompt.set(settings.hideDonationPrompt || false);
        activeTheme.set(settings.activeTheme || "light");
        fontSize.set(settings.fontSize || 100);
        userThemes.set(settings.userThemes || []);
    }
}

/**
 * Saves the entire current state of settings to the persistent file.
 */
async function saveAllSettings() {
    const settings: AppSettings = {
        hideDonationPrompt: get(hideDonationPrompt),
        activeTheme: get(activeTheme),
        fontSize: get(fontSize),
        userThemes: get(userThemes),
    };
    await settingsFile.set("allSettings", settings);
    await settingsFile.save();
}

/**
 * Sets the 'hideDonationPrompt' setting to true and saves it.
 */
export async function setHideDonationPrompt() {
    hideDonationPrompt.set(true);
    await saveAllSettings();
}

/**
 * Sets the application theme. By default, it saves the choice.
 * @param newThemeName The name of the theme to activate.
 * @param save Pass false to prevent writing to disk. Defaults to true.
 */
export async function setActiveTheme(
    newThemeName: ThemeName,
    save: boolean = true,
) {
    activeTheme.set(newThemeName);
    if (save) {
        await saveAllSettings();
    }
}

/**
 * Sets the application's base font size and saves the choice.
 */
export async function setFontSize(newSize: number) {
    fontSize.set(newSize);
    await saveAllSettings();
}

/**
 * Adds a new custom theme or updates an existing one.
 * @param theme The custom theme object to save.
 */
export async function saveCustomTheme(theme: CustomTheme) {
    userThemes.update((themes) => {
        const existingIndex = themes.findIndex((t) => t.name === theme.name);
        if (existingIndex > -1) {
            themes[existingIndex] = theme; // Update existing theme
        } else {
            themes.push(theme); // Add new theme
        }
        return themes;
    });
    await saveAllSettings();
}

/**
 * Deletes a custom theme by its name.
 * @param themeName The name of the theme to delete.
 */
export async function deleteCustomTheme(themeName: ThemeName) {
    userThemes.update((themes) => themes.filter((t) => t.name !== themeName));
    // If the deleted theme was active, fall back to the light theme.
    if (get(activeTheme) === themeName) {
        activeTheme.set("light");
    }
    await saveAllSettings();
}

/**
 * A Svelte writable store that acts as a reactive signal to force UI updates.
 *
 * Its actual numeric value is irrelevant. Its sole purpose is to be a dependency
 * in an `$effect` that needs to be manually re-triggered. This is used to ensure
 * the global theme styles are correctly re-applied after being temporarily
 * overridden by an imperative process like a live preview.
 *
 * It is recommended to use the `forceThemeRefresh()` function instead of
 * directly manipulating this store.
 */
export const themeRefresher = writable(0);

/**
 * Triggers a global theme style refresh.
 *
 * This function updates the `themeRefresher` store, which causes any `$effect`
 * subscribing to it (like the main theme-applying logic) to re-run.
 * Call this function after a process that may have left the theme's
 * CSS in an inconsistent state.
 */
export function forceThemeRefresh() {
    themeRefresher.update((n) => n + 1);
}
