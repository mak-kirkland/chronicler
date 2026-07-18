/**
 * @file Measures rendered label widths for timeline chips so the layout can
 * reserve exactly the room each label needs. A measurer captures the current
 * chip font (0.78rem in the app's body font) once, then caches per-title
 * widths. Outside the browser (unit tests) it falls back to a rough
 * character-count estimate.
 */

/** Font size of a chip label relative to the root font size (see the `.chip`
 * rule in TimelineEventChip.svelte). */
const CHIP_FONT_REM = 0.78;
/** Rough average glyph width as a fraction of font size, for the no-canvas
 * fallback only. */
const FALLBACK_EM = 0.58;

export type LabelMeasurer = (title: string) => number;

/** Build a measurer bound to the document's current font. Rebuild it when the
 * font settings change (cheap; callers make one per layout pass). */
export function createLabelMeasurer(): LabelMeasurer {
    const cache = new Map<string, number>();

    let ctx: CanvasRenderingContext2D | null = null;
    let fallbackCharPx = CHIP_FONT_REM * 16 * FALLBACK_EM;
    if (typeof document !== "undefined") {
        const rootPx =
            parseFloat(getComputedStyle(document.documentElement).fontSize) ||
            16;
        const fontPx = CHIP_FONT_REM * rootPx;
        fallbackCharPx = fontPx * FALLBACK_EM;
        ctx = document.createElement("canvas").getContext("2d");
        if (ctx) {
            const family =
                getComputedStyle(document.body).fontFamily || "sans-serif";
            ctx.font = `${fontPx.toFixed(2)}px ${family}`;
        }
    }

    return (title: string) => {
        const key = title ?? "";
        let w = cache.get(key);
        if (w == null) {
            w = ctx ? ctx.measureText(key).width : key.length * fallbackCharPx;
            cache.set(key, w);
        }
        return w;
    };
}
