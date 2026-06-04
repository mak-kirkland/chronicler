/**
 * JSON Canvas preset colors. The spec defines color ids "1".."6"; the exact
 * hues are renderer-defined. These mirror Obsidian's palette so shared files
 * look consistent. A node's `color` may also be a raw hex string.
 */
export const PRESET_COLORS: Record<string, string> = {
    "1": "#e05252", // red
    "2": "#e0913a", // orange
    "3": "#dcd04b", // yellow
    "4": "#5bbf6a", // green
    "5": "#43b9c4", // cyan
    "6": "#9a6dd7", // purple
};

/** Resolve a JSON Canvas color (preset id or hex) to CSS, or null if unset. */
export function colorToCss(color: string | undefined): string | null {
    if (!color) return null;
    return PRESET_COLORS[color] ?? color;
}
