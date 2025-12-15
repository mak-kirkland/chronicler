/**
 * @file Manages persistent user settings using the Tauri Store Plugin.
 *
 * This store handles UI-related preferences that need to persist between
 * application sessions. It manages two distinct settings files:
 * 1. A global settings file for theme definitions and app-wide preferences.
 * 2. A per-vault settings file for workspace-specific configurations.
 */

import { writable, get, derived } from "svelte/store";
import { LazyStore } from "@tauri-apps/plugin-store";
import { join } from "@tauri-apps/api/path";
import type { UserFont } from "$lib/bindings";
import { isColorDark } from "$lib/utils";
import { SIDEBAR_INITIAL_WIDTH } from "$lib/config";
import {
    BUILT_IN_THEME_FONTS,
    BUILT_IN_THEME_MODES,
    type ThemePalette,
} from "./themeRegistry";

// --- Type Definitions ---

/** Defines the shape of the GLOBAL settings object saved to disk. */
interface GlobalSettings {
    userThemes: CustomTheme[];
    /**
     * The name of the last active theme.
     * Storing this globally allows the app to load the correct theme
     * immediately on startup, before any vault-specific settings are loaded.
     */
    lastActiveTheme?: ThemeName;
}

/**
 * Defines the configuration for the modular atmosphere system.
 * Each field corresponds to a specific visual module.
 */
export interface AtmosphereSettings {
    icons: string;
    buttons: string;
    textures: string;
    typography: string;
    cursors: string;
    borders: string; // Covers modals and app edges
    frames: string; // Covers image borders (gallery, infobox)
    uiElements: string; // Scrollbars, toggles, separators
    soundscape: string;
    clickEffects: string;

    textureOpacity: number;
}

/** Defines the shape of the PER-VAULT settings object saved to disk. */
interface VaultSettings {
    activeTheme: ThemeName;
    atmosphere: AtmosphereSettings;
    headingFont: string;
    bodyFont: string;
    fontSize: number;
    sidebarWidth: number;
    isTocVisible: boolean;
    areInfoboxTagsVisible: boolean;
    areFooterTagsVisible: boolean;
}

export type ThemeName = string;

/** Defines a theme's color palette and optional font preferences. **/
export interface CustomTheme {
    name: ThemeName;
    palette: ThemePalette;
    headingFont?: string;
    bodyFont?: string;
}

// --- Store Management ---

// Use LazyStore to prevent SSR issues. It will only load when first accessed.
let globalSettingsFile: LazyStore | null = null;
let vaultSettingsFile: LazyStore | null = null;

const GLOBAL_SETTINGS_FILENAME = "global.settings.json";
const VAULT_SETTINGS_FILENAME = ".chronicler.vault.json";

// Create Svelte stores to hold settings in memory for easy, reactive access.
// We provide sensible defaults for first-time users or when no vault is loaded.

// Global Stores
export const userThemes = writable<CustomTheme[]>([]);
/** A store to hold the list of custom fonts loaded from the user's config directory. */
export const userFonts = writable<UserFont[]>([]);

// Per-Vault Stores
export const activeTheme = writable<ThemeName>("light");

// Default atmosphere settings
const defaultAtmosphere: AtmosphereSettings = {
    icons: "core",
    buttons: "core",
    textures: "core",
    typography: "core",
    cursors: "core",
    borders: "core",
    frames: "core",
    uiElements: "core",
    soundscape: "core",
    clickEffects: "core",

    textureOpacity: 0.3,
};

export const atmosphere = writable<AtmosphereSettings>(defaultAtmosphere);

export const headingFont = writable<string>(`"Uncial Antiqua", cursive`);
export const bodyFont = writable<string>(`"IM Fell English", serif`);
export const fontSize = writable<number>(100);
export const sidebarWidth = writable<number>(SIDEBAR_INITIAL_WIDTH);
export const isTocVisible = writable<boolean>(true); // Default to visible
export const areInfoboxTagsVisible = writable<boolean>(true);
export const areFooterTagsVisible = writable<boolean>(false);

// --- Helper: Migration Logic ---

/**
 * Smartly fills missing syntax colors for older themes.
 * Instead of forcing a default "Olive/Green" look, it tries to borrow
 * colors from the theme's existing UI palette (like accents and text colors)
 * to keep the theme consistent.
 */
function fillMissingColors(palette: Partial<ThemePalette> | any): ThemePalette {
    const p = { ...palette };

    // Helper to safely get a color or fallback to black if the theme is truly broken
    const getCol = (key: string) => p[key] || "#000000";

    // Fallbacks for Syntax Keys
    if (!p["--code-tag"]) p["--code-tag"] = getCol("--color-text-heading");
    if (!p["--code-attribute"])
        p["--code-attribute"] = getCol("--color-text-secondary");
    if (!p["--code-string"])
        p["--code-string"] = getCol("--color-text-primary");

    return p as ThemePalette;
}

// --- Helper: Derived Atmosphere Mode ---

/**
 * A derived store that automatically determines if the UI should be in
 * "Light" or "Dark" mode based on the currently active theme.
 *
 * This is the source of truth for 'data-mode' attributes.
 */
export const atmosphereMode = derived(
    [activeTheme, userThemes],
    ([$activeTheme, $userThemes]) => {
        // 1. Check Built-ins
        if ($activeTheme in BUILT_IN_THEME_MODES) {
            return BUILT_IN_THEME_MODES[$activeTheme];
        }

        // 2. Check Custom Themes
        const customTheme = $userThemes.find((t) => t.name === $activeTheme);
        if (customTheme) {
            const bg = customTheme.palette["--color-background-primary"];
            if (bg && isColorDark(bg)) {
                return "dark";
            }
        }

        // Default fallback
        return "light";
    },
);

// --- Private Save Functions ---

/**
 * Saves the current state of GLOBAL settings to the persistent file.
 */
async function saveGlobalSettings() {
    if (!globalSettingsFile) return;
    const settings: GlobalSettings = {
        userThemes: get(userThemes),
        // By saving the active theme here, we persist it across sessions
        // and between opening/closing vaults.
        lastActiveTheme: get(activeTheme),
    };
    await globalSettingsFile.set("globalSettings", settings);
    await globalSettingsFile.save();
}

/**
 * Saves the current state of VAULT settings to the persistent file.
 */
async function saveVaultSettings() {
    if (!vaultSettingsFile) return;
    const settings: VaultSettings = {
        activeTheme: get(activeTheme),
        atmosphere: get(atmosphere),
        headingFont: get(headingFont),
        bodyFont: get(bodyFont),
        fontSize: get(fontSize),
        sidebarWidth: get(sidebarWidth),
        isTocVisible: get(isTocVisible),
        areInfoboxTagsVisible: get(areInfoboxTagsVisible),
        areFooterTagsVisible: get(areFooterTagsVisible),
    };
    await vaultSettingsFile.set("vaultSettings", settings);
    await vaultSettingsFile.save();
}

// --- Public API & Lifecycle ---

/**
 * Loads all GLOBAL settings from the persistent file store into the reactive Svelte stores.
 * This should be called once when the application initializes.
 */
export async function loadGlobalSettings() {
    // Global settings are stored in the app's data directory.
    globalSettingsFile = new LazyStore(GLOBAL_SETTINGS_FILENAME);

    const settings =
        await globalSettingsFile.get<GlobalSettings>("globalSettings");
    if (settings) {
        // MIGRATION STEP:
        // Ensure all loaded themes have the full palette (including new syntax keys).
        // If they are missing keys, fill them with smart defaults.
        const migratedThemes = (settings.userThemes ?? []).map((theme) => ({
            ...theme,
            palette: fillMissingColors(theme.palette),
        }));

        userThemes.set(migratedThemes);

        // Load the last used theme from the global settings file.
        activeTheme.set(settings.lastActiveTheme ?? "light");
    }
    // Enable automatic saving for global settings.
    userThemes.subscribe(debouncedGlobalSave);
    // Also subscribe the activeTheme to the global saver. This is the key
    // to persisting the theme when it's changed.
    activeTheme.subscribe(debouncedGlobalSave);
}

/**
 * Loads all VAULT settings from a file inside the vault directory.
 * @param vaultPath The absolute path to the user's current vault.
 */
export async function initializeVaultSettings(vaultPath: string) {
    const settingsFilePath = await join(vaultPath, VAULT_SETTINGS_FILENAME);
    vaultSettingsFile = new LazyStore(settingsFilePath);

    const settings =
        await vaultSettingsFile.get<VaultSettings>("vaultSettings");
    if (settings) {
        // Once a vault is loaded, its specific settings take precedence.
        activeTheme.set(settings.activeTheme ?? "light");

        // Load atmosphere settings, falling back to defaults
        const loadedAtmosphere = settings.atmosphere ?? defaultAtmosphere;
        // Ensure new fields are present if missing from file
        atmosphere.set({ ...defaultAtmosphere, ...loadedAtmosphere });

        headingFont.set(settings.headingFont ?? `"Uncial Antiqua", cursive`);
        bodyFont.set(settings.bodyFont ?? `"IM Fell English", serif`);
        fontSize.set(settings.fontSize ?? 100);
        sidebarWidth.set(settings.sidebarWidth ?? SIDEBAR_INITIAL_WIDTH);
        isTocVisible.set(settings.isTocVisible ?? true); // Fallback to true
        areInfoboxTagsVisible.set(settings.areInfoboxTagsVisible ?? true);
        areFooterTagsVisible.set(settings.areFooterTagsVisible ?? true);
    } else {
        // If the vault has no settings file, it should adopt the current theme.
        // We immediately save the current settings to create the vault file,
        // ensuring consistency.
        saveVaultSettings();
    }

    // Enable automatic saving for vault settings.
    activeTheme.subscribe(debouncedVaultSave);
    atmosphere.subscribe(debouncedVaultSave); // Listen to atmosphere changes
    headingFont.subscribe(debouncedVaultSave);
    bodyFont.subscribe(debouncedVaultSave);
    fontSize.subscribe(debouncedVaultSave);
    sidebarWidth.subscribe(debouncedVaultSave);
    isTocVisible.subscribe(debouncedVaultSave);
    areInfoboxTagsVisible.subscribe(debouncedVaultSave);
    areFooterTagsVisible.subscribe(debouncedVaultSave);
}

/**
 * Resets vault-specific settings to their defaults when a vault is closed.
 */
export function destroyVaultSettings() {
    // Unsubscribe from automatic saving by replacing the stores.
    // This is simpler than managing unsubscribe functions for this use case.

    // Do NOT reset the theme or fonts here. By leaving the activeTheme,
    // headingFont and bodyFont stores untouched, the appearance will
    // persist on the vault selector screen.

    fontSize.set(100);
    sidebarWidth.set(SIDEBAR_INITIAL_WIDTH);
    isTocVisible.set(true); // Reset to default
    areInfoboxTagsVisible.set(true);
    areFooterTagsVisible.set(true);

    // Reset atmosphere to defaults so next vault starts fresh if unconfigured
    atmosphere.set(defaultAtmosphere);

    vaultSettingsFile = null; // Ensure no further saves can happen.
}

/**
 * Sets the application theme and synchronizes default fonts if it's a built-in theme
 * OR if the custom theme has specified preferred fonts.
 * @param newThemeName The name of the theme to activate.
 */
export function setActiveTheme(newThemeName: ThemeName) {
    activeTheme.set(newThemeName);

    // 1. Check if the selected theme is a built-in one with default fonts.
    const builtInFonts = BUILT_IN_THEME_FONTS[newThemeName];
    if (builtInFonts) {
        headingFont.set(builtInFonts.heading);
        bodyFont.set(builtInFonts.body);
        return;
    }

    // 2. Check if it's a user theme with font preferences
    const customTheme = get(userThemes).find((t) => t.name === newThemeName);
    if (customTheme) {
        if (customTheme.headingFont) {
            headingFont.set(customTheme.headingFont);
        }
        if (customTheme.bodyFont) {
            bodyFont.set(customTheme.bodyFont);
        }
    }
}

/**
 * Sets the application's base font size for the current vault.
 */
export function setFontSize(newSize: number) {
    fontSize.set(newSize);
}

/**
 * Adds a new custom theme or updates an existing one in the global store.
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
 * Deletes a custom theme by its name from the global store.
 * @param themeName The name of the theme to delete.
 */
export function deleteCustomTheme(themeName: ThemeName) {
    userThemes.update((themes) => themes.filter((t) => t.name !== themeName));
    // If the deleted theme was active, fall back to the light theme.
    if (get(activeTheme) === themeName) {
        // Use the smart setter to ensure fonts reset correctly too
        setActiveTheme("light");
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

/**
 * A helper function to prevent rapid, successive writes to disk.
 * @param func The function to call after the delay.
 * @param delay The wait time in milliseconds.
 */
function debounce(func: () => Promise<void>, delay: number) {
    let timeout: ReturnType<typeof setTimeout>;
    return () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func();
        }, delay);
    };
}

// Create two separate debounced savers for the two settings files.
const debouncedGlobalSave = debounce(saveGlobalSettings, 500);
const debouncedVaultSave = debounce(saveVaultSettings, 500);
