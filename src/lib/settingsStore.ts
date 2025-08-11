/**
 * @file Manages persistent user settings using the Tauri Store Plugin.
 *
 * This store handles UI-related preferences that need to persist between
 * application sessions. It manages two distinct settings files:
 * 1. A global settings file for theme definitions and app-wide preferences.
 * 2. A per-vault settings file for workspace-specific configurations.
 */

import { writable, get } from "svelte/store";
import { LazyStore } from "@tauri-apps/plugin-store";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

import { SIDEBAR_INITIAL_WIDTH } from "$lib/config";

// --- Type Definitions ---

/** Defines the shape of the GLOBAL settings object saved to disk. */
interface GlobalSettings {
    userThemes: CustomTheme[];
    hideDonationPrompt: boolean;
}

/** Defines the shape of the PER-VAULT settings object saved to disk. */
interface VaultSettings {
    activeTheme: ThemeName;
    fontSize: number;
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

// --- Store Management ---

// Use LazyStore to prevent SSR issues. It will only load when first accessed.
let globalSettingsFile: LazyStore | null = null;
let vaultSettingsFile: LazyStore | null = null;

const GLOBAL_SETTINGS_FILENAME = "global.settings.json";
const VAULT_SETTINGS_FILENAME = ".chronicler.vault.json";

// Create Svelte stores to hold settings in memory for easy, reactive access.
// We provide sensible defaults for first-time users or when no vault is loaded.

// Global Stores
export const hideDonationPrompt = writable<boolean>(false);
export const userThemes = writable<CustomTheme[]>([]);

// Per-Vault Stores
export const activeTheme = writable<ThemeName>("light");
export const fontSize = writable<number>(100);
export const sidebarWidth = writable<number>(SIDEBAR_INITIAL_WIDTH);

// --- Private Save Functions ---

/**
 * Saves the current state of GLOBAL settings to the persistent file.
 */
async function saveGlobalSettings() {
    if (!globalSettingsFile) return;
    const settings: GlobalSettings = {
        userThemes: get(userThemes),
        hideDonationPrompt: get(hideDonationPrompt),
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
        fontSize: get(fontSize),
        sidebarWidth: get(sidebarWidth),
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
        hideDonationPrompt.set(settings.hideDonationPrompt ?? false);
        userThemes.set(settings.userThemes ?? []);
    }
    // Enable automatic saving for global settings.
    hideDonationPrompt.subscribe(debouncedGlobalSave);
    userThemes.subscribe(debouncedGlobalSave);
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
        activeTheme.set(settings.activeTheme ?? "light");
        fontSize.set(settings.fontSize ?? 100);
        sidebarWidth.set(settings.sidebarWidth ?? SIDEBAR_INITIAL_WIDTH);
    }

    // Enable automatic saving for vault settings.
    activeTheme.subscribe(debouncedVaultSave);
    fontSize.subscribe(debouncedVaultSave);
    sidebarWidth.subscribe(debouncedVaultSave);
}

/**
 * Resets vault-specific settings to their defaults when a vault is closed.
 */
export function destroyVaultSettings() {
    // Unsubscribe from automatic saving by replacing the stores.
    // This is simpler than managing unsubscribe functions for this use case.
    activeTheme.set("light");
    fontSize.set(100);
    sidebarWidth.set(SIDEBAR_INITIAL_WIDTH);
    vaultSettingsFile = null; // Ensure no further saves can happen.
}

/**
 * Sets the 'hideDonationPrompt' setting to true.
 */
export function setHideDonationPrompt() {
    hideDonationPrompt.set(true);
}

/**
 * Sets the application theme for the current vault.
 * @param newThemeName The name of the theme to activate.
 */
export function setActiveTheme(newThemeName: ThemeName) {
    activeTheme.set(newThemeName);
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
