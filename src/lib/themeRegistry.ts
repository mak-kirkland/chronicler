/**
 * @file Central registry for static theme configuration data.
 * This file defines "what" options exist (fonts, colors, built-in themes),
 * while settingsStore manages "which" are selected by the user.
 */

/**
 * The standard UI colors of the app.
 */
export const UI_PALETTE_KEYS = [
    "--color-background-primary",
    "--color-background-secondary",
    "--color-background-tertiary",
    "--color-text-heading",
    "--color-text-primary",
    "--color-text-secondary",
    "--color-border-primary",
    "--color-accent-primary",
    "--color-icons",
    "--color-text-link",
    "--color-text-link-broken",
    "--color-text-error",
] as const;

/**
 * The syntax highlighting keys.
 */
export const SYNTAX_PALETTE_KEYS = [
    "--code-tag",
    "--code-attribute",
    "--code-string",
] as const;

/**
 * The canonical list of CSS variables that make up a FULL theme palette.
 * This is the single source of truth for the application's theme structure.
 */
export const THEME_PALETTE_KEYS = [
    ...UI_PALETTE_KEYS,
    ...SYNTAX_PALETTE_KEYS,
] as const;

/**
 * A union type representing all possible CSS variable names for a theme color.
 */
export type PaletteKey = (typeof THEME_PALETTE_KEYS)[number];

/**
 * Defines the shape of a single theme's color palette.
 */
export type ThemePalette = {
    [Key in PaletteKey]: string;
};

/**
 * The fonts available for theme customization.
 * The `value` should match the 'font-family' name in CSS.
 */
export const AVAILABLE_FONTS = [
    { name: "Cinzel", value: `"Cinzel", serif` },
    { name: "IBM Plex Mono", value: `"IBM Plex Mono", monospace` },
    { name: "IM Fell English", value: `"IM Fell English", serif` },
    { name: "Merriweather", value: `"Merriweather", serif` },
    { name: "Open Sans", value: `"Open Sans", sans-serif` },
    { name: "Orbitron", value: `"Orbitron", sans-serif` },
    { name: "Spectral", value: `"Spectral", serif` },
    { name: "Uncial Antiqua", value: `"Uncial Antiqua", cursive` },
] as const;

/**
 * Defines the default fonts for each built-in theme.
 */
export const BUILT_IN_THEME_FONTS: Record<
    string,
    { heading: string; body: string }
> = {
    light: {
        heading: `"Uncial Antiqua", cursive`,
        body: `"IM Fell English", serif`,
    },
    burgundy: {
        heading: `"Cinzel", serif`,
        body: `"IM Fell English", serif`,
    },
    dark: {
        heading: `"Uncial Antiqua", cursive`,
        body: `"Spectral", serif`,
    },
    "slate-and-gold": {
        heading: `"Cinzel", serif`,
        body: `"Spectral", serif`,
    },
    hologram: {
        heading: `"Orbitron", sans-serif`,
        body: `"IBM Plex Mono", monospace`,
    },
    professional: {
        heading: `"Merriweather", serif`,
        body: `"Open Sans", sans-serif`,
    },
};

/**
 * Registry of brightness modes for built-in themes.
 * Used to determine if the UI should be in "Light" or "Dark" mode.
 */
export const BUILT_IN_THEME_MODES: Record<string, "light" | "dark"> = {
    light: "light",
    burgundy: "light",
    dark: "dark",
    "slate-and-gold": "dark",
    hologram: "dark",
    professional: "light",
};
