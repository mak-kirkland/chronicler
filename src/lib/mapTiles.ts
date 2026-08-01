/**
 * Tile pyramid geometry shared by the Leaflet map view.
 *
 * The Rust tiler (`src-tauri/src/tiler.rs`) slices each map image into a
 * pyramid of 512×512 tiles. This module owns the arithmetic that decides
 * *which* pyramid level Leaflet draws for a given view — kept out of
 * `MapView.svelte` so it can be tested directly.
 */

/**
 * Tile pixel size. **MUST match `TILE_SIZE` in `src-tauri/src/tiler.rs`** —
 * used in the max-zoom formula and as the basis for the `tileSize` option on
 * every `L.GridLayer` we mount. A mismatch makes Leaflet request tiles that
 * don't exist.
 */
export const TILE_SIZE = 512;

/**
 * Compute the max zoom level of the tile pyramid for an image of the
 * given dimensions.
 *
 * **This formula MUST stay in sync with `calculate_max_zoom` in
 * `src-tauri/src/tiler.rs`**, including the floor at zero for images smaller
 * than a single tile. Both must produce the same number for the same image
 * dimensions, or Leaflet will request tiles that don't exist.
 *
 * For an 8640×5400 image with TILE_SIZE=512: ceil(log2(8640/512)) = 5.
 */
export function tileMaxZoomFor(width: number, height: number): number {
    return Math.max(
        0,
        Math.ceil(Math.log2(Math.max(width, height) / TILE_SIZE)),
    );
}

/**
 * The display's pixel density as a (fractional) number of zoom levels.
 *
 * Not exported: on its own it is only half of the density adjustment, and
 * splitting the two halves across call sites is what caused the bug this
 * module exists to prevent. `gridZoomFor` combines them.
 */
function densityZoomBias(dpr: number): number {
    if (!Number.isFinite(dpr) || dpr <= 1) return 0;
    return Math.log2(dpr);
}

/**
 * How many pyramid levels deeper than the Leaflet grid zoom we must fetch to
 * keep up with the display's pixel density.
 *
 * Leaflet reasons entirely in CSS pixels, but a tile is a bitmap that lands on
 * *device* pixels. On a 2× display a 512-px tile drawn into a 512 CSS-px box
 * is stretched across 1024 device pixels — half the detail the screen can
 * show. Fetching one level deeper and drawing it into a half-size CSS box
 * restores the 1:1 mapping. This is what Leaflet's `detectRetina` does for
 * `L.TileLayer`; `L.GridLayer` has no equivalent, so we do it by hand.
 *
 * Whole levels only, because tile boundaries stay aligned only at powers of
 * two (see `tileSizeForOffset`). Densities in between — 1.25 and 1.5 are the
 * common Windows settings — round up here and get the difference handed back
 * by `gridZoomFor`, so they cost a fraction of a level rather than a whole
 * one. Capped at `maxZoom` for images whose pyramid is too shallow to go
 * deeper.
 */
export function densityOffset(dpr: number, maxZoom: number): number {
    return Math.min(Math.ceil(densityZoomBias(dpr)), maxZoom);
}

/**
 * CSS size of one tile for a given density offset.
 *
 * Tile boundaries only line up with the pyramid when the grid cell covers the
 * same span of source pixels as the tile it holds, which pins this to
 * `TILE_SIZE / 2^offset` — never `TILE_SIZE / dpr`.
 */
export function tileSizeForOffset(offset: number): number {
    return TILE_SIZE / Math.pow(2, offset);
}

/**
 * The deepest grid zoom that still maps onto a pyramid level that exists —
 * `createTile` fetches level `gridZoom + offset`.
 */
export function maxGridZoom(pyramidMaxZoom: number, offset: number): number {
    return Math.max(0, pyramidMaxZoom - offset);
}

/**
 * Pick the grid zoom to draw for a (usually fractional) map zoom.
 *
 * Two corrections to Leaflet's own choice, applied together:
 *
 * 1. It selects the level with `Math.round(zoom)`, which for any view below
 *    the halfway point of a level draws fewer pixels than the screen is about
 *    to spend on it — up to a 1.41× upscale. A map opens at exactly such a
 *    view (`MapView` pins it to the fractional "image fills the pane" zoom),
 *    so the first thing a user saw was the blurriest thing we draw. Rounding
 *    up instead means tiles are always downsampled, never stretched.
 *
 * 2. The display density is added *before* that round-up, not rounded
 *    separately. Rounding both overshoots: at 150% scaling with a fit zoom of
 *    3.05 it reaches level 5 — the entire native pyramid, the full-resolution
 *    texture tiling exists to avoid — where level 4 already covers the
 *    viewport at 1.29 source pixels per device pixel.
 *
 * The `- offset` cancels the `+ offset` that `createTile` applies when it
 * turns a grid zoom into a pyramid level, so the level finally fetched is
 * `ceil(mapZoom + log2(dpr))`: the shallowest one that still covers the
 * viewport at device resolution.
 */
export function gridZoomFor(
    mapZoom: number,
    pyramidMaxZoom: number,
    dpr: number,
): number {
    const offset = densityOffset(dpr, pyramidMaxZoom);
    const target = Math.ceil(mapZoom + densityZoomBias(dpr) - offset);
    return Math.min(maxGridZoom(pyramidMaxZoom, offset), Math.max(0, target));
}
