/**
 * @file Region shape operations on a whole map config: merge, cut a hole
 * (drawn or from another region), fill a hole, split apart. Plus the small
 * helpers MapView's right-click menu and merge pick mode use to decide what
 * to offer.
 *
 * Every operation is pure: it returns a new config (or a reason it did
 * nothing) and never mutates its input. Callers run them inside
 * `updateMapConfig`'s update function so they always see the latest config.
 * Geometry errors from polygon-clipping are thrown, not swallowed.
 */

import type { MapConfig, MapPoint, MapPolygon, MapRegion } from "./mapModels";
import {
    holeIndexAt,
    pieceArea,
    piecesArea,
    regionCoverage,
    regionPieces,
    subtractPieces,
    unionPieces,
    withPieces,
    type RegionPiece,
} from "./mapGeometry";

export type RegionOpResult =
    | { ok: true; config: MapConfig }
    | {
          ok: false;
          reason: "notFound" | "notPolygon" | "wouldRemoveAll" | "noChange";
      };

type Failure = Extract<RegionOpResult, { ok: false }>;

/**
 * Area changes below this (in square image pixels) count as "nothing
 * happened" — covers rounding noise from re-normalising an outline.
 */
const AREA_EPSILON = 0.5;

function findPolygon(config: MapConfig, id: string): MapPolygon | Failure {
    const shape = config.shapes.find((s) => s.id === id);
    if (!shape) return { ok: false, reason: "notFound" };
    if (shape.type !== "polygon") return { ok: false, reason: "notPolygon" };
    return shape;
}

const isFailure = (x: MapPolygon | Failure): x is Failure =>
    "ok" in x && x.ok === false;

function replaceShape(config: MapConfig, updated: MapPolygon): MapConfig {
    return {
        ...config,
        shapes: config.shapes.map((s) => (s.id === updated.id ? updated : s)),
    };
}

/** Target minus cutter, with the no-op and remove-everything checks. */
function subtractFrom(
    config: MapConfig,
    target: MapPolygon,
    cutter: RegionPiece[],
): RegionOpResult {
    const before = unionPieces(regionPieces(target));
    const after = subtractPieces(before, cutter);
    if (after.length === 0) return { ok: false, reason: "wouldRemoveAll" };
    if (piecesArea(before) - piecesArea(after) < AREA_EPSILON) {
        return { ok: false, reason: "noChange" };
    }
    return {
        ok: true,
        config: replaceShape(config, withPieces(target, after)),
    };
}

/** Cut a freshly drawn outline out of a region. The outline leaves nothing behind. */
export function cutHole(
    config: MapConfig,
    regionId: string,
    drawn: MapPoint[],
): RegionOpResult {
    const target = findPolygon(config, regionId);
    if (isFailure(target)) return target;
    const cutter =
        drawn.length >= 3 ? unionPieces([{ points: drawn, holes: [] }]) : [];
    if (cutter.length === 0) return { ok: false, reason: "noChange" };
    return subtractFrom(config, target, cutter);
}

/** Cut one region's shape out of another. The cutter region is left as is. */
export function cutRegionOut(
    config: MapConfig,
    targetId: string,
    cutterId: string,
): RegionOpResult {
    const target = findPolygon(config, targetId);
    if (isFailure(target)) return target;
    const cutter = findPolygon(config, cutterId);
    if (isFailure(cutter)) return cutter;
    return subtractFrom(config, target, regionPieces(cutter));
}

/** Remove the hole that `at` falls in. */
export function fillHole(
    config: MapConfig,
    regionId: string,
    at: MapPoint,
): RegionOpResult {
    const target = findPolygon(config, regionId);
    if (isFailure(target)) return target;
    const pieces = regionPieces(target);
    const hit = holeIndexAt(at, pieces);
    if (!hit) return { ok: false, reason: "noChange" };
    const filled = pieces.map((p, i) =>
        i === hit.piece
            ? {
                  points: p.points,
                  holes: p.holes.filter((_, h) => h !== hit.hole),
              }
            : p,
    );
    // Another piece may have sat inside that hole (an island merged into a
    // lake); re-union so it fuses rather than overlapping the outline, where
    // even-odd fill would draw it as a hole that still hit-tests as land.
    // A single piece can't overlap anything, so it's kept exactly as drawn.
    const result = pieces.length > 1 ? unionPieces(filled) : filled;
    if (result.length === 0) return { ok: false, reason: "noChange" };
    return {
        ok: true,
        config: replaceShape(config, withPieces(target, result)),
    };
}

/**
 * Union the other regions into the target and delete them. The target keeps
 * its id, name, colour, links, layer and position in the list.
 */
export function mergeRegions(
    config: MapConfig,
    targetId: string,
    otherIds: string[],
): RegionOpResult {
    const target = findPolygon(config, targetId);
    if (isFailure(target)) return target;

    const wanted = new Set(otherIds.filter((id) => id !== targetId));
    const others = config.shapes.filter(
        (s): s is MapPolygon => wanted.has(s.id) && s.type === "polygon",
    );
    if (others.length === 0) return { ok: false, reason: "noChange" };

    const merged = unionPieces(
        regionPieces(target),
        ...others.map(regionPieces),
    );
    if (merged.length === 0) return { ok: false, reason: "noChange" };

    const absorbed = new Set(others.map((s) => s.id));
    const updated = withPieces(target, merged);
    return {
        ok: true,
        config: {
            ...config,
            shapes: config.shapes
                .filter((s) => !absorbed.has(s.id))
                .map((s) => (s.id === targetId ? updated : s)),
        },
    };
}

/**
 * Turn each piece of a multi-piece region into its own region with a copy of
 * the region's name, colour, links and layer. The largest piece keeps the
 * original id; the rest follow it in the list, largest first.
 */
export function splitRegion(
    config: MapConfig,
    regionId: string,
    newId: () => string,
): RegionOpResult {
    const target = findPolygon(config, regionId);
    if (isFailure(target)) return target;
    const pieces = regionPieces(target);
    if (pieces.length < 2) return { ok: false, reason: "noChange" };

    const sorted = [...pieces].sort((a, b) => pieceArea(b) - pieceArea(a));
    const [first, ...rest] = sorted;
    const replacements: MapRegion[] = [
        withPieces(target, [first]),
        ...rest.map((p) => withPieces({ ...target, id: newId() }, [p])),
    ];
    return {
        ok: true,
        config: {
            ...config,
            shapes: config.shapes.flatMap((s) =>
                s.id === regionId ? replacements : [s],
            ),
        },
    };
}

// --- Helpers for deciding what the menu / pick mode offers ---

export function regionArea(shape: MapRegion): number {
    if (shape.type === "circle") return Math.PI * shape.radius * shape.radius;
    return regionCoverage(shape);
}

/**
 * "Cut B out of A" candidates among the regions under the cursor: only the
 * natural direction (smaller cut out of larger). Circles and equal-area pairs
 * are skipped. Ordered by the target's, then the cutter's, position in `under`.
 */
export function cutOutPairs(
    under: MapRegion[],
): { target: MapPolygon; cutter: MapPolygon }[] {
    const polys = under.filter((s): s is MapPolygon => s.type === "polygon");
    // Measuring can be costly the first time; don't when there's no pair.
    if (polys.length < 2) return [];
    const areas = polys.map(regionArea);
    const pairs: { t: number; c: number }[] = [];
    for (let i = 0; i < polys.length; i++) {
        for (let j = i + 1; j < polys.length; j++) {
            if (areas[i] > areas[j]) pairs.push({ t: i, c: j });
            else if (areas[j] > areas[i]) pairs.push({ t: j, c: i });
        }
    }
    pairs.sort((a, b) => a.t - b.t || a.c - b.c);
    return pairs.map(({ t, c }) => ({ target: polys[t], cutter: polys[c] }));
}

/** Polygons for which `at` lies inside one of their holes. */
export function regionsWithHoleAt(
    candidates: MapRegion[],
    at: MapPoint,
): MapPolygon[] {
    return candidates.filter(
        (s): s is MapPolygon =>
            s.type === "polygon" &&
            (!!s.holes?.length || !!s.parts?.some((p) => p.holes?.length)) &&
            holeIndexAt(at, regionPieces(s)) !== null,
    );
}

/** In merge pick mode: the smallest polygon under the cursor that isn't the target. */
export function pickMergeCandidate(
    under: MapRegion[],
    targetId: string,
): MapPolygon | null {
    const candidates = under.filter(
        (s): s is MapPolygon => s.type === "polygon" && s.id !== targetId,
    );
    // Only measure when there's a choice to make.
    if (candidates.length < 2) return candidates[0] ?? null;
    let best: MapPolygon | null = null;
    let bestArea = Infinity;
    for (const s of candidates) {
        const a = regionArea(s);
        if (a < bestArea) {
            best = s;
            bestArea = a;
        }
    }
    return best;
}

/** "Merge X with…" only makes sense if there's another outline region to pick. */
export function hasMergePartner(
    shapes: MapRegion[],
    targetId: string,
): boolean {
    return shapes.some((s) => s.type === "polygon" && s.id !== targetId);
}
