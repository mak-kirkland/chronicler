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
    { name: "Junicode", value: `"Junicode", serif` },
    { name: "Merriweather", value: `"Merriweather", serif` },
    { name: "Open Sans", value: `"Open Sans", sans-serif` },
    { name: "Orbitron", value: `"Orbitron", sans-serif` },
    { name: "Spectral", value: `"Spectral", serif` },
    { name: "Uncial Antiqua", value: `"Uncial Antiqua", cursive` },
    { name: "Girassol", value: `"Girassol", cursive` },
    { name: "Nunito", value: `"Nunito", sans-serif` },
] as const;

/**
 * Defines the default fonts for each built-in theme.
 */
export const BUILT_IN_THEME_FONTS: Record<
    string,
    { heading: string; body: string }
> = {
    light: {
        heading: `"Cinzel", serif`,
        body: `"Junicode", serif`,
    },
    burgundy: {
        heading: `"Cinzel", serif`,
        body: `"Junicode", serif`,
    },
    dark: {
        heading: `"Cinzel", serif`,
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
    paneidos: {
        heading: `"Girassol", cursive`,
        body: `"Nunito", sans-serif`,
    },
};

/**
 * The built-in themes, in the order they're offered to the user.
 *
 * `swatch` mirrors the three colours that most define a theme at a glance, as
 * declared in `src/app.css`. **If you change a built-in theme's background,
 * secondary background, or accent in app.css, update it here too.**
 *
 * The obvious way to avoid this duplication is to stamp `data-theme` on the
 * swatch element and read `var(--color-background-primary)` — `[data-theme=…]`
 * is a plain attribute selector, so it does match a nested element. It doesn't
 * work as things stand: the theme blocks in app.css are *partial overlays* on
 * `:root`, so a nested swatch inherits whatever the block omits from the theme
 * currently applied to <html>. Concretely that's `burgundy` (declares only the
 * accent of the three) and `light` (no block at all) — five declarations, not
 * seven palettes, if you ever want to close it.
 *
 * A test that parses app.css and asserts these still match would be the right
 * guard, and was tried: Vite returns empty content for `?raw` on a stylesheet
 * under vitest, and `node:fs` doesn't type-check because the project has no
 * `@types/node`. Adding that dev dependency is all it would take.
 */
export const BUILT_IN_THEMES: {
    id: string;
    label: string;
    swatch: { background: string; secondary: string; accent: string };
}[] = [
    {
        id: "light",
        label: "Parchment & Ink",
        swatch: {
            background: "#fdf6e3",
            secondary: "#eee8db",
            accent: "#6d4c2a",
        },
    },
    {
        id: "burgundy",
        label: "Parchment & Wine",
        swatch: {
            background: "#fdf6e3",
            secondary: "#eee8db",
            accent: "#943030",
        },
    },
    {
        id: "dark",
        label: "Slate & Chalk (Dark)",
        swatch: {
            background: "#23232a",
            secondary: "#2e2e38",
            accent: "#8a9bb0",
        },
    },
    {
        id: "slate-and-gold",
        label: "Slate & Gold (Dark)",
        swatch: {
            background: "#2a2a2e",
            secondary: "#3a3a3e",
            accent: "#d4c585",
        },
    },
    {
        id: "hologram",
        label: "Sci-Fi Hologram",
        swatch: {
            background: "#020a1f",
            secondary: "#0d275a",
            accent: "#00a8aa",
        },
    },
    {
        id: "professional",
        label: "Professional",
        swatch: {
            background: "#ffffff",
            secondary: "#f8f9fa",
            accent: "#0d6efd",
        },
    },
    {
        id: "paneidos",
        label: "Paneidos",
        swatch: {
            background: "#eadcc5",
            secondary: "#ede0c6",
            accent: "#320606",
        },
    },
];

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
    paneidos: "light",
};
