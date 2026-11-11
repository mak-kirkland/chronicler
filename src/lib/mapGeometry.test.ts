import { describe, it, expect } from "vitest";
import type { MapPoint, MapPolygon } from "./mapModels";
import {
    regionPieces,
    withPieces,
    pieceArea,
    piecesArea,
    piecesBounds,
    isPointInPieces,
    holeIndexAt,
    largestPiece,
    largestPieceCenter,
    regionGeometry,
    isPointInRegion,
    unionPieces,
    subtractPieces,
    type RegionPiece,
} from "./mapGeometry";

/** Axis-aligned rectangle as an open ring (no repeated closing point). */
function rect(x0: number, y0: number, x1: number, y1: number): MapPoint[] {
    return [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
    ];
}

function piece(points: MapPoint[], holes: MapPoint[][] = []): RegionPiece {
    return { points, holes };
}

function poly(extra: Partial<MapPolygon> = {}): MapPolygon {
    return { id: "r1", type: "polygon", points: rect(0, 0, 10, 10), ...extra };
}

const allPoints = (pieces: RegionPiece[]) =>
    pieces.flatMap((p) => [p.points, ...p.holes]).flat();

describe("regionPieces", () => {
    it("treats a plain polygon as one piece with no holes", () => {
        const sq = rect(0, 0, 10, 10);
        expect(regionPieces(poly({ points: sq }))).toEqual([
            { points: sq, holes: [] },
        ]);
    });

    it("lists the first piece with its holes, then the extra parts", () => {
        const a = rect(0, 0, 10, 10);
        const h = rect(4, 4, 6, 6);
        const b = rect(20, 20, 30, 30);
        const shape = poly({ points: a, holes: [h], parts: [{ points: b }] });
        expect(regionPieces(shape)).toEqual([
            { points: a, holes: [h] },
            { points: b, holes: [] },
        ]);
    });
});

describe("withPieces", () => {
    it("writes a single plain piece back exactly as the old format", () => {
        const original = poly({ label: "Italy", color: "#f00" });
        const result = withPieces(original, [piece(rect(0, 0, 10, 10))]);
        expect(result).toEqual(original);
        expect("holes" in result).toBe(false);
        expect("parts" in result).toBe(false);
    });

    it("puts the largest piece first and keeps the region's fields", () => {
        const small = rect(0, 0, 2, 2);
        const big = rect(10, 10, 30, 30);
        const result = withPieces(poly({ label: "Nation", color: "#0f0" }), [
            piece(small),
            piece(big),
        ]);
        expect(result.points).toEqual(big);
        expect(result.parts).toEqual([{ points: small }]);
        expect(result.id).toBe("r1");
        expect(result.label).toBe("Nation");
        expect(result.color).toBe("#0f0");
        expect("holes" in result).toBe(false);
    });

    it("drops stale holes and parts from the shape it replaces", () => {
        const shape = poly({
            holes: [rect(4, 4, 6, 6)],
            parts: [{ points: rect(20, 20, 30, 30) }],
        });
        const result = withPieces(shape, [piece(rect(0, 0, 10, 10))]);
        expect("holes" in result).toBe(false);
        expect("parts" in result).toBe(false);
    });

    it("refuses an empty piece list", () => {
        expect(() => withPieces(poly(), [])).toThrow();
    });
});

describe("areas and bounds", () => {
    it("subtracts hole area from the outline's area", () => {
        expect(pieceArea(piece(rect(0, 0, 10, 10), [rect(4, 4, 6, 6)]))).toBe(
            96,
        );
    });

    it("is orientation independent", () => {
        expect(pieceArea(piece(rect(0, 0, 10, 10).reverse()))).toBe(100);
    });

    it("sums the pieces", () => {
        expect(
            piecesArea([
                piece(rect(0, 0, 10, 10)),
                piece(rect(20, 20, 25, 25)),
            ]),
        ).toBe(125);
    });

    it("bounds cover every piece", () => {
        expect(
            piecesBounds([
                piece(rect(0, 0, 10, 10)),
                piece(rect(80, 85, 90, 95)),
            ]),
        ).toEqual({ minX: 0, minY: 0, maxX: 90, maxY: 95 });
    });

    it("finds the largest piece by area minus holes", () => {
        const holey = piece(rect(0, 0, 10, 10), [rect(1, 1, 9, 9)]); // 36
        const solid = piece(rect(20, 20, 27, 27)); // 49
        expect(largestPiece([holey, solid])).toBe(solid);
    });
});

describe("point tests", () => {
    const pieces = [
        piece(rect(0, 0, 10, 10), [rect(4, 4, 6, 6)]),
        piece(rect(20, 20, 30, 30)),
    ];

    it("is outside inside a hole", () => {
        expect(isPointInPieces({ x: 5, y: 5 }, pieces)).toBe(false);
    });

    it("is inside the solid part of a piece", () => {
        expect(isPointInPieces({ x: 1, y: 1 }, pieces)).toBe(true);
    });

    it("is inside a second piece", () => {
        expect(isPointInPieces({ x: 25, y: 25 }, pieces)).toBe(true);
    });

    it("is outside between pieces", () => {
        expect(isPointInPieces({ x: 15, y: 5 }, pieces)).toBe(false);
    });

    it("locates the hole a point is in", () => {
        expect(holeIndexAt({ x: 5, y: 5 }, pieces)).toEqual({
            piece: 0,
            hole: 0,
        });
        expect(holeIndexAt({ x: 1, y: 1 }, pieces)).toBeNull();
        expect(holeIndexAt({ x: 50, y: 50 }, pieces)).toBeNull();
    });
});

describe("unionPieces", () => {
    it("keeps pieces that don't touch separate", () => {
        const result = unionPieces(
            [piece(rect(0, 0, 10, 10))],
            [piece(rect(20, 20, 30, 30))],
        );
        expect(result).toHaveLength(2);
        expect(piecesArea(result)).toBe(200);
    });

    it("fuses overlapping pieces into one outline", () => {
        const result = unionPieces(
            [piece(rect(0, 0, 10, 10))],
            [piece(rect(5, 5, 15, 15))],
        );
        expect(result).toHaveLength(1);
        expect(piecesArea(result)).toBe(175);
    });

    it("does not throw on a self-crossing (bow-tie) outline", () => {
        const bowtie = [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 10, y: 0 },
            { x: 0, y: 10 },
        ];
        expect(() => unionPieces([piece(bowtie)])).not.toThrow();
        expect(() =>
            subtractPieces([piece(rect(-5, -5, 15, 15))], [piece(bowtie)]),
        ).not.toThrow();
    });
});

describe("subtractPieces", () => {
    it("makes a hole when the cutter is inside", () => {
        const result = subtractPieces(
            [piece(rect(0, 0, 10, 10))],
            [piece(rect(4, 4, 6, 6))],
        );
        expect(result).toHaveLength(1);
        expect(result[0].holes).toHaveLength(1);
        expect(piecesArea(result)).toBe(96);
    });

    it("trims a cutter that crosses the edge into a bite, not a hole", () => {
        const result = subtractPieces(
            [piece(rect(0, 0, 10, 10))],
            [piece(rect(8, 0, 12, 10))],
        );
        expect(result).toHaveLength(1);
        expect(result[0].holes).toHaveLength(0);
        expect(piecesArea(result)).toBe(80);
    });

    it("returns nothing when the cutter covers everything", () => {
        expect(
            subtractPieces(
                [piece(rect(0, 0, 10, 10))],
                [piece(rect(-1, -1, 11, 11))],
            ),
        ).toEqual([]);
    });

    it("splits a piece in two when cut straight across", () => {
        const result = subtractPieces(
            [piece(rect(0, 0, 10, 10))],
            [piece(rect(4, -1, 6, 11))],
        );
        expect(result).toHaveLength(2);
    });
});

describe("output shape", () => {
    it("returns open rings rounded to two decimals", () => {
        const tri = [
            { x: 0, y: 0 },
            { x: 10, y: 0.001 },
            { x: 3.33333, y: 7.77777 },
        ];
        const result = unionPieces(
            [piece(tri)],
            [piece(rect(2.123456, 1.987654, 20, 3))],
        );
        for (const p of result) {
            for (const ring of [p.points, ...p.holes]) {
                const first = ring[0];
                const last = ring[ring.length - 1];
                expect(first.x === last.x && first.y === last.y).toBe(false);
            }
        }
        for (const pt of allPoints(result)) {
            expect(Math.round(pt.x * 100) / 100).toBe(pt.x);
            expect(Math.round(pt.y * 100) / 100).toBe(pt.y);
        }
    });
});

describe("largestPieceCenter", () => {
    it("centres on the largest piece, not the whole region", () => {
        const shape = poly({
            points: rect(0, 0, 10, 10),
            parts: [{ points: rect(50, 50, 90, 90) }],
        });
        expect(largestPieceCenter(shape)).toEqual({ x: 70, y: 70 });
    });
});

describe("regionGeometry (memoised per shape object)", () => {
    const shape = poly({
        points: rect(0, 0, 10, 10),
        holes: [rect(4, 4, 6, 6)],
        parts: [{ points: rect(50, 50, 90, 90) }],
    });

    it("is computed once per shape object", () => {
        expect(regionGeometry(shape)).toBe(regionGeometry(shape));
        expect(regionGeometry({ ...shape })).not.toBe(regionGeometry(shape));
    });

    it("carries each piece's bounds", () => {
        expect(regionGeometry(shape).pieceBounds).toEqual([
            { minX: 0, minY: 0, maxX: 10, maxY: 10 },
            { minX: 50, minY: 50, maxX: 90, maxY: 90 },
        ]);
    });

    it("reuses the anchor on repeated hovers", () => {
        expect(largestPieceCenter(shape)).toBe(largestPieceCenter(shape));
    });

    it("hit-tests through the cached pieces", () => {
        expect(isPointInRegion({ x: 5, y: 5 }, shape)).toBe(false);
        expect(isPointInRegion({ x: 1, y: 1 }, shape)).toBe(true);
        expect(isPointInRegion({ x: 70, y: 70 }, shape)).toBe(true);
        expect(isPointInRegion({ x: 30, y: 30 }, shape)).toBe(false);
    });
});
