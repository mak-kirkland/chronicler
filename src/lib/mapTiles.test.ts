import { describe, it, expect } from "vitest";
import {
    TILE_SIZE,
    tileMaxZoomFor,
    densityOffset,
    tileSizeForOffset,
    gridZoomFor,
} from "./mapTiles";

/**
 * Models the view `MapView` opens a map at: the fractional Leaflet zoom where
 * the image exactly fills the pane. Under the map's custom CRS an image pixel
 * spans 2^(zoom - maxZoom) CSS pixels, so the fitting zoom is maxZoom plus the
 * log2 of the fit scale. `MapView` pins both the initial view and `minZoom`
 * here, which makes it the most-zoomed-out view a user can reach.
 */
function fitZoom(w: number, h: number, vw: number, vh: number): number {
    const maxZoom = tileMaxZoomFor(w, h);
    // Leaflet's getBoundsZoom clamps to both ends of the map's zoom range;
    // MapView's map allows one level of over-zoom past native.
    const fit = maxZoom + Math.log2(Math.min(vw / w, vh / h));
    return Math.min(maxZoom + 1, Math.max(0, fit));
}

/**
 * Source pixels across the pyramid level actually drawn for a given view,
 * versus device pixels that view spends on the image. A ratio below 1 means
 * the tile bitmap is being stretched — visible blur.
 *
 * `sourceLimited` marks the case where we are already drawing the deepest
 * level: the source image itself has fewer pixels than the viewport, so no
 * pyramid could do better. The full-resolution overlay this replaced hit the
 * same wall, so that is parity, not regression.
 */
function drawnLevel(w: number, h: number, vw: number, vh: number, dpr: number) {
    const pyramidMax = tileMaxZoomFor(w, h);
    // The same call `_clampZoom` makes, then the same `+ levelOffset`
    // `createTile` applies to turn a grid zoom into a pyramid level.
    const grid = gridZoomFor(fitZoom(w, h, vw, vh), pyramidMax, dpr);
    const level = grid + densityOffset(dpr, pyramidMax);

    const levelWidth = w / Math.pow(2, pyramidMax - level);
    const deviceWidth = w * Math.min(vw / w, vh / h) * dpr;
    return {
        level,
        ratio: levelWidth / deviceWidth,
        sourceLimited: level >= pyramidMax,
    };
}

// The pane sizes a map view realistically gets, across window sizes and with
// the sidebar open or split view active.
const VIEWPORTS: [number, number][] = [
    [1600, 950],
    [1920, 1080],
    [1440, 860],
    [1280, 760],
    [2560, 1400],
    [1720, 1000],
    [1512, 880],
    [900, 700],
];

// 1 = standard, 1.5/1.25 = common Windows scaling, 2 = macOS Retina.
const DENSITIES = [1, 1.25, 1.5, 2, 3];

describe("tileMaxZoomFor", () => {
    // Must agree with `calculate_max_zoom` in src-tauri/src/tiler.rs.
    it("matches the Rust tiler for the same dimensions", () => {
        expect(tileMaxZoomFor(512, 512)).toBe(0);
        expect(tileMaxZoomFor(1024, 1024)).toBe(1);
        expect(tileMaxZoomFor(2048, 2048)).toBe(2);
        expect(tileMaxZoomFor(8192, 6000)).toBe(4);
        expect(tileMaxZoomFor(4096, 512)).toBe(3);
        expect(tileMaxZoomFor(8640, 5400)).toBe(5);
    });

    it("clamps sub-tile images to 0, as the Rust cast does", () => {
        // `max_dim / 512` is < 1 here, so the logarithm goes negative; the
        // Rust side's `f64 as u32` saturates instead.
        expect(tileMaxZoomFor(100, 80)).toBe(0);
        expect(tileMaxZoomFor(400, 300)).toBe(0);
    });
});

describe("densityOffset", () => {
    it("leaves standard-density displays alone", () => {
        expect(densityOffset(1, 5)).toBe(0);
    });

    it("maps exact power-of-two densities to whole levels", () => {
        expect(densityOffset(2, 5)).toBe(1);
        expect(densityOffset(4, 5)).toBe(2);
    });

    it("rounds fractional scaling up to the next power of two", () => {
        expect(densityOffset(1.25, 5)).toBe(1);
        expect(densityOffset(1.5, 5)).toBe(1);
        expect(densityOffset(3, 5)).toBe(2);
    });

    it("never asks for a level a shallow pyramid does not have", () => {
        // A 512×512 image has only level 0 — there is no finer detail to fetch.
        expect(densityOffset(2, 0)).toBe(0);
        expect(densityOffset(3, 1)).toBe(1);
    });

    it("tolerates a missing or nonsense devicePixelRatio", () => {
        expect(densityOffset(NaN, 5)).toBe(0);
        expect(densityOffset(0, 5)).toBe(0);
    });
});

describe("tileSizeForOffset", () => {
    it("makes a grid cell cover exactly the source span of its tile", () => {
        // The real invariant: at grid zoom z a cell of `tileSize` CSS px spans
        // tileSize × 2^(maxZoom − z) source px, and it holds a level-(z+offset)
        // tile spanning TILE_SIZE × 2^(maxZoom − z − offset). Computed from
        // both ends, these must agree — that is what keeps tiles aligned.
        const maxZoom = 5;
        for (const offset of [0, 1, 2, 3]) {
            for (let z = 0; z <= maxZoom - offset; z++) {
                const cellSpan =
                    tileSizeForOffset(offset) * Math.pow(2, maxZoom - z);
                const tileSpan = TILE_SIZE * Math.pow(2, maxZoom - z - offset);
                expect(cellSpan).toBe(tileSpan);
            }
        }
    });
});

describe("gridZoomFor", () => {
    it("rounds up so tiles are downsampled, never stretched", () => {
        expect(gridZoomFor(2.493, 5, 1)).toBe(3);
        expect(gridZoomFor(2.05, 5, 1)).toBe(3);
        expect(gridZoomFor(3.0, 5, 1)).toBe(3);
    });

    it("clamps to the levels that exist on disk", () => {
        expect(gridZoomFor(9, 5, 1)).toBe(5);
        expect(gridZoomFor(-2, 5, 1)).toBe(0);
    });

    it("spends density on the level, not on the grid zoom", () => {
        // At 2× the bias and the offset cancel, so the grid zoom is unchanged
        // and `createTile`'s `+ offset` is what reaches the deeper level:
        // same grid, one level finer, quarter-size tiles.
        expect(gridZoomFor(2.493, 5, 1)).toBe(3);
        expect(gridZoomFor(2.493, 5, 2)).toBe(3);
        expect(gridZoomFor(2.493, 5, 2) + densityOffset(2, 5)).toBe(4);
    });

    it("costs fractional scaling a fraction of a level, not a whole one", () => {
        // 1.5× at fit zoom 3.05: level 4 covers the viewport, so the grid zoom
        // must be 3 with an offset of 1 — not 4, which would reach native.
        const grid = gridZoomFor(3.052, 5, 1.5);
        expect(grid + densityOffset(1.5, 5)).toBe(4);
    });

    it("never asks for a level past the end of a shallow pyramid", () => {
        // A 512×512 image has only level 0, however dense the display.
        expect(gridZoomFor(0, 0, 3)).toBe(0);
        expect(gridZoomFor(5, 1, 3)).toBe(0);
    });

    it("tolerates a missing or nonsense devicePixelRatio", () => {
        expect(gridZoomFor(2.493, 5, NaN)).toBe(3);
        expect(gridZoomFor(2.493, 5, 0)).toBe(3);
    });
});

describe("opening view detail", () => {
    // The regression users reported: an 8640×5400 map in a typical pane.
    it("keeps the reported map sharp at its opening zoom", () => {
        expect(
            drawnLevel(8640, 5400, 1600, 950, 2).ratio,
        ).toBeGreaterThanOrEqual(1);
    });

    it("never stretches the pyramid at the opening zoom", () => {
        const failures: string[] = [];
        for (const [w, h] of [
            [8640, 5400],
            [4000, 3000],
            [2275, 1280],
            [6000, 6000],
            [1200, 901],
            [640, 480], // smaller than the pane — a region or battle map
        ] as [number, number][]) {
            for (const [vw, vh] of VIEWPORTS) {
                for (const dpr of DENSITIES) {
                    const { ratio, sourceLimited } = drawnLevel(
                        w,
                        h,
                        vw,
                        vh,
                        dpr,
                    );
                    // Below 1:1 is only acceptable when the source image has
                    // run out of pixels, not when a deeper level exists.
                    if (ratio < 1 && !sourceLimited) {
                        failures.push(
                            `${w}×${h} in ${vw}×${vh} @${dpr}x → ${ratio.toFixed(2)}`,
                        );
                    }
                }
            }
        }
        expect(failures).toEqual([]);
    });

    it("does not overshoot into needlessly large levels", () => {
        // The level we draw must be the shallowest one that suffices: if it
        // oversamples by 2× or more per axis, the level below it would also
        // have covered the viewport, and we are holding four times the tiles
        // for no visible gain. At the top of the pyramid that means pulling
        // the entire full-resolution image — exactly what tiling exists to
        // avoid. Rounding the zoom and the density separately fails this at
        // 1.25× and 1.5× scaling; level 0 is exempt, having nothing below it.
        const overshoots: string[] = [];
        for (const [vw, vh] of VIEWPORTS) {
            for (const dpr of DENSITIES) {
                const { level, ratio } = drawnLevel(8640, 5400, vw, vh, dpr);
                if (ratio >= 2 && level > 0) {
                    overshoots.push(
                        `${vw}×${vh} @${dpr}x → level ${level}, ${ratio.toFixed(2)}× oversampled`,
                    );
                }
            }
        }
        expect(overshoots).toEqual([]);
    });

    it("reaches native resolution only when the view actually needs it", () => {
        // The 2560×1400 pane at 150% scaling is the case that regressed:
        // level 4 covers it at 1.29 source px per device px, but a second
        // round-up reached level 5 — all 187 tiles of the 46MP source.
        const { level, ratio } = drawnLevel(8640, 5400, 2560, 1400, 1.5);
        expect(level).toBe(4);
        expect(ratio).toBeGreaterThanOrEqual(1);
    });
});
