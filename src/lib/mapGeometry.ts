/**
 * @file Geometry for polygon regions made of several pieces with holes.
 *
 * A polygon region is viewed as a list of `RegionPiece`s — an outline plus
 * its holes. `regionPieces()` reads that view from a `MapPolygon` and
 * `withPieces()` writes it back in the file layout documented on
 * `MapPolygon`. Boolean operations (union, difference) go through
 * `polygon-clipping`; everything else is plain arithmetic.
 *
 * Pure module: no Leaflet, no DOM, so it runs under vitest's node env.
 */

import polygonClipping from "polygon-clipping";
import type { Polygon, MultiPolygon, Ring } from "polygon-clipping";
import type { MapPoint, MapPolygon, MapPolygonPart } from "./mapModels";

/** One piece of a region: an outline and the holes inside it. */
export interface RegionPiece {
    points: MapPoint[];
    /** Always present; empty when the piece has no holes. */
    holes: MapPoint[][];
}

export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

// --- Reading and writing the file layout ---

/** The pieces of a polygon region, first piece first. */
export function regionPieces(shape: MapPolygon): RegionPiece[] {
    const pieces: RegionPiece[] = [
        { points: shape.points, holes: shape.holes ?? [] },
    ];
    for (const part of shape.parts ?? []) {
        pieces.push({ points: part.points, holes: part.holes ?? [] });
    }
    return pieces;
}

/**
 * Returns a copy of `shape` whose geometry is `pieces`, written largest piece
 * first. `holes`/`parts` are omitted when empty so a plain region keeps the
 * original single-outline format.
 */
export function withPieces<T extends MapPolygon>(
    shape: T,
    pieces: RegionPiece[],
): T {
    if (pieces.length === 0) {
        throw new Error("withPieces: a region needs at least one piece");
    }
    const sorted = [...pieces].sort((a, b) => pieceArea(b) - pieceArea(a));
    const [first, ...rest] = sorted;

    const { holes: _h, parts: _p, ...base } = shape;
    const result = { ...base, points: first.points } as T;
    if (first.holes.length > 0) result.holes = first.holes;
    if (rest.length > 0) {
        result.parts = rest.map((p) => {
            const part: MapPolygonPart = { points: p.points };
            if (p.holes.length > 0) part.holes = p.holes;
            return part;
        });
    }
    return result;
}

// --- Measurement ---

function ringArea(ring: MapPoint[]): number {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        sum += (ring[j].x + ring[i].x) * (ring[j].y - ring[i].y);
    }
    return Math.abs(sum) / 2;
}

/** Area of the outline minus its holes (never negative). */
export function pieceArea(piece: RegionPiece): number {
    let area = ringArea(piece.points);
    for (const hole of piece.holes) area -= ringArea(hole);
    return Math.max(0, area);
}

export function piecesArea(pieces: RegionPiece[]): number {
    return pieces.reduce((sum, p) => sum + pieceArea(p), 0);
}

/** Bounding box of every piece's outline. */
export function piecesBounds(pieces: RegionPiece[]): Bounds {
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const piece of pieces) {
        for (const p of piece.points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
    }
    return { minX, minY, maxX, maxY };
}

export function largestPiece(pieces: RegionPiece[]): RegionPiece {
    let best = pieces[0];
    let bestArea = -1;
    for (const p of pieces) {
        const a = pieceArea(p);
        if (a > bestArea) {
            best = p;
            bestArea = a;
        }
    }
    return best;
}

// --- Point tests ---

/** Whether `pt` is inside the closed `ring` (even-odd ray cast). */
export function isPointInRing(pt: MapPoint, ring: MapPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i].x,
            yi = ring[i].y;
        const xj = ring[j].x,
            yj = ring[j].y;
        if (
            yi > pt.y !== yj > pt.y &&
            pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
        ) {
            inside = !inside;
        }
    }
    return inside;
}

/** True when `pt` is inside the piece's outline and not inside its holes. */
function inPiece(pt: MapPoint, piece: RegionPiece): boolean {
    return (
        isPointInRing(pt, piece.points) &&
        !piece.holes.some((h) => isPointInRing(pt, h))
    );
}

/** True when `pt` is inside some piece (and not inside that piece's holes). */
export function isPointInPieces(pt: MapPoint, pieces: RegionPiece[]): boolean {
    return pieces.some((piece) => inPiece(pt, piece));
}

/** Which hole (if any) `pt` falls in. */
export function holeIndexAt(
    pt: MapPoint,
    pieces: RegionPiece[],
): { piece: number; hole: number } | null {
    for (let i = 0; i < pieces.length; i++) {
        if (!isPointInRing(pt, pieces[i].points)) continue;
        const h = pieces[i].holes.findIndex((ring) => isPointInRing(pt, ring));
        if (h !== -1) return { piece: i, hole: h };
    }
    return null;
}

// --- Per-shape cache ---

/** Geometry derived from a polygon region, computed once per shape object. */
export interface RegionGeometry {
    pieces: RegionPiece[];
    /** Bounds of each piece's outline, in `pieces` order. */
    pieceBounds: Bounds[];
}

interface CachedGeometry extends RegionGeometry {
    anchor?: MapPoint;
    coverage?: number;
}

/**
 * Keyed on the shape object itself. Map edits never mutate a shape — every
 * change (ops, the edit modal, resize) produces a new object — so an entry
 * can't go stale, and replaced shapes drop out with their config.
 */
const geometryCache = new WeakMap<MapPolygon, CachedGeometry>();

function cached(shape: MapPolygon): CachedGeometry {
    let entry = geometryCache.get(shape);
    if (!entry) {
        const pieces = regionPieces(shape);
        entry = { pieces, pieceBounds: pieces.map((p) => piecesBounds([p])) };
        geometryCache.set(shape, entry);
    }
    return entry;
}

export function regionGeometry(shape: MapPolygon): RegionGeometry {
    return cached(shape);
}

/**
 * Hit-test a polygon region (any number of pieces and holes). Each piece is
 * bounds-checked first, so a wide archipelago only ray-casts the piece(s)
 * near the point. Runs on every throttled mousemove.
 */
export function isPointInRegion(pt: MapPoint, shape: MapPolygon): boolean {
    const { pieces, pieceBounds } = cached(shape);
    for (let i = 0; i < pieces.length; i++) {
        const b = pieceBounds[i];
        if (pt.x < b.minX || pt.x > b.maxX || pt.y < b.minY || pt.y > b.maxY) {
            continue;
        }
        if (inPiece(pt, pieces[i])) return true;
    }
    return false;
}

/**
 * Where to anchor a tooltip or preview: the centre of the largest piece's
 * bounds, so an archipelago's tooltip doesn't land in open sea. Cached —
 * it's read on hover. Treat the returned point as read-only.
 */
export function largestPieceCenter(shape: MapPolygon): MapPoint {
    const entry = cached(shape);
    if (!entry.anchor) {
        const i = entry.pieces.indexOf(largestPiece(entry.pieces));
        const b = entry.pieceBounds[i];
        entry.anchor = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    }
    return entry.anchor;
}

/**
 * Above this many vertices a region's outline is taken as drawn: normalising
 * it costs ~0.5 s at 100k vertices, and outlines that big are traced or
 * imported, not the hand-clicked kind that crosses itself.
 */
const NORMALISE_VERTEX_LIMIT = 2000;

/**
 * The area a region actually covers. Measured on the normalised outline, so
 * a hand-drawn self-crossing outline (whose raw shoelace area cancels out to
 * ~0) isn't mistaken for a tiny region — except for very large outlines (see
 * `NORMALISE_VERTEX_LIMIT`), which use the plain area. Cached; also falls
 * back to the plain area if the outline can't be normalised.
 */
export function regionCoverage(shape: MapPolygon): number {
    const entry = cached(shape);
    if (entry.coverage === undefined) {
        let vertices = 0;
        for (const p of entry.pieces) {
            vertices += p.points.length;
            for (const h of p.holes) vertices += h.length;
        }
        try {
            entry.coverage =
                vertices > NORMALISE_VERTEX_LIMIT
                    ? piecesArea(entry.pieces)
                    : piecesArea(unionPieces(entry.pieces));
        } catch {
            entry.coverage = piecesArea(entry.pieces);
        }
    }
    return entry.coverage;
}

// --- Boolean operations ---

const round2 = (n: number) => Math.round(n * 100) / 100;

function toRing(points: MapPoint[]): Ring {
    return points.map((p) => [p.x, p.y]);
}

function toPolygon(piece: RegionPiece): Polygon {
    return [toRing(piece.points), ...piece.holes.map(toRing)];
}

function toMulti(pieces: RegionPiece[]): MultiPolygon {
    return pieces.map(toPolygon);
}

/**
 * polygon-clipping ring → open, rounded ring with consecutive duplicates
 * removed. Returns null if fewer than 3 distinct points survive.
 */
function fromRing(ring: Ring): MapPoint[] | null {
    const out: MapPoint[] = [];
    for (const [x, y] of ring) {
        const p = { x: round2(x), y: round2(y) };
        const prev = out[out.length - 1];
        if (prev && prev.x === p.x && prev.y === p.y) continue;
        out.push(p);
    }
    // Output rings are closed; drop the repeated closing point.
    while (
        out.length > 1 &&
        out[0].x === out[out.length - 1].x &&
        out[0].y === out[out.length - 1].y
    ) {
        out.pop();
    }
    return out.length >= 3 ? out : null;
}

function fromMulti(multi: MultiPolygon): RegionPiece[] {
    const pieces: RegionPiece[] = [];
    for (const [outline, ...holes] of multi) {
        const points = outline ? fromRing(outline) : null;
        if (!points) continue;
        const keptHoles: MapPoint[][] = [];
        for (const h of holes) {
            const ring = fromRing(h);
            if (ring) keptHoles.push(ring);
        }
        pieces.push({ points, holes: keptHoles });
    }
    return pieces;
}

/**
 * Union of every set of pieces. Overlapping pieces fuse; separate ones stay
 * separate. Also normalises self-crossing outlines.
 */
export function unionPieces(...sets: RegionPiece[][]): RegionPiece[] {
    const geoms = sets.filter((s) => s.length > 0).map(toMulti);
    if (geoms.length === 0) return [];
    const [first, ...rest] = geoms;
    return fromMulti(polygonClipping.union(first, ...rest));
}

/** `subject` minus `cutter`. Empty when nothing is left. */
export function subtractPieces(
    subject: RegionPiece[],
    cutter: RegionPiece[],
): RegionPiece[] {
    if (subject.length === 0) return [];
    if (cutter.length === 0) return unionPieces(subject);
    return fromMulti(
        polygonClipping.difference(toMulti(subject), toMulti(cutter)),
    );
}
