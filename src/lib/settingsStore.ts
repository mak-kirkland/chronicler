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
import { SIDEBAR_INITIAL_WIDTH } from "$lib/config";

// --- Type Definitions ---

/** Defines the shape of the entire settings object saved to disk. */
interface AppSettings {
    hideDonationPrompt: boolean;
    activeTheme: ThemeName;
    fontSize: number;
    userThemes: CustomTheme[];
    sidebarWidth: number;
}

export type ThemeName = string;

/**
 * The canonical list of CSS variables that make up a theme palette.
 * This is the single source of truth for the application's theme structure.
 */
export const THEME_PALETTE_KEYS = [
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
] as const;

/**
 * A union type representing all possible CSS variable names for a theme color.
 *
 * This type is derived from the `THEME_PALETTE_KEYS` constant array, ensuring that any
 * function or component using it will only accept valid theme keys known to the application.
 */
type PaletteKey = (typeof THEME_PALETTE_KEYS)[number];

/**
 * Defines the shape of a single theme's color palette.
 * This type is generated automatically from the THEME_PALETTE_KEYS array.
 */
export type ThemePalette = {
    [Key in PaletteKey]: string;
};

/**
 * A new constant to define the fonts available for theme customization.
 * The `value` should match the 'font-family' name in your CSS.
 */
export const AVAILABLE_FONTS = [
    { name: "Cinzel", value: `"Cinzel", serif` },
    { name: "IBM Plex Mono", value: `"IBM Plex Mono", monospace` },
    { name: "IM Fell English", value: `"IM Fell English", serif` },
    { name: "Merriweather", value: `"Merriweather", serif` },
    { name: "Open Sans", value: `"Open Sans", sans-serif` },
    { name: "Orbitron", value: `"Orbitron", sans-serif` },
    { name: "Uncial Antiqua", value: `"Uncial Antiqua", cursive` },
] as const;

/** Defines a full theme object, including its name, palette, and fonts. */
export interface CustomTheme {
    name: ThemeName;
    palette: ThemePalette;
    fontFamilyHeading?: string;
    fontFamilyBody?: string;
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
export const sidebarWidth = writable<number>(SIDEBAR_INITIAL_WIDTH);

// --- Private Functions ---

/**
 * Saves the entire current state of settings to the persistent file.
 */
async function saveAllSettings() {
    const settings: AppSettings = {
        hideDonationPrompt: get(hideDonationPrompt),
        activeTheme: get(activeTheme),
        fontSize: get(fontSize),
        userThemes: get(userThemes),
        sidebarWidth: get(sidebarWidth),
    };
    await settingsFile.set("allSettings", settings);
    await settingsFile.save();
}

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
        sidebarWidth.set(settings.sidebarWidth || SIDEBAR_INITIAL_WIDTH);
    }
    // Enable automatic saving only after initial settings have been loaded.
    isInitialized = true;
}

/**
 * Sets the 'hideDonationPrompt' setting to true.
 */
export function setHideDonationPrompt() {
    hideDonationPrompt.set(true);
}

/**
 * Sets the application theme.
 * @param newThemeName The name of the theme to activate.
 */
export function setActiveTheme(newThemeName: ThemeName) {
    activeTheme.set(newThemeName);
}

/**
 * Sets the application's base font size.
 */
export function setFontSize(newSize: number) {
    fontSize.set(newSize);
}

/**
 * Adds a new custom theme or updates an existing one.
 * @param theme The custom theme object to save.
 */
export function saveCustomTheme(theme: CustomTheme) {
    userThemes.update((themes) => {
        const existingIndex = themes.findIndex((t) => t.name === theme.name);
        if (existingIndex > -1) {
            themes[existingIndex] = theme; // Update existing theme
        } else {
            themes.push(theme); // Add new theme
        }
        return themes;
    });
}

/**
 * Deletes a custom theme by its name.
 * @param themeName The name of the theme to delete.
 */
export function deleteCustomTheme(themeName: ThemeName) {
    userThemes.update((themes) => themes.filter((t) => t.name !== themeName));
    // If the deleted theme was active, fall back to the light theme.
    if (get(activeTheme) === themeName) {
        activeTheme.set("light");
    }
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

// --- Automatic Persistence ---

let saveTimeout: ReturnType<typeof setTimeout>;
let isInitialized = false;

/**
 * A debounced version of saveAllSettings. This prevents rapid, successive
 * writes to disk when settings are changed quickly.
 */
function debouncedSave() {
    // Clear any pending save operation
    clearTimeout(saveTimeout);
    // Schedule a new save operation
    saveTimeout = setTimeout(() => {
        // Only save if the initial settings have been loaded
        if (isInitialized) {
            console.log("Saving settings to disk...");
            saveAllSettings();
        }
    }, 500); // Wait 500ms after the last change before saving
}

// Subscribe to every settings store. Whenever one changes, trigger a debounced save.
hideDonationPrompt.subscribe(debouncedSave);
activeTheme.subscribe(debouncedSave);
fontSize.subscribe(debouncedSave);
userThemes.subscribe(debouncedSave);
sidebarWidth.subscribe(debouncedSave);
