import { describe, it, expect, vi, afterEach } from "vitest";
import polygonClipping from "polygon-clipping";
import type {
    MapCircle,
    MapConfig,
    MapPoint,
    MapPolygon,
    MapRegion,
} from "./mapModels";
import { regionPieces, piecesArea } from "./mapGeometry";
import {
    cutHole,
    cutRegionOut,
    fillHole,
    mergeRegions,
    splitRegion,
    regionArea,
    cutOutPairs,
    regionsWithHoleAt,
    pickMergeCandidate,
    hasMergePartner,
    type RegionOpResult,
} from "./mapRegionOps";

function rect(x0: number, y0: number, x1: number, y1: number): MapPoint[] {
    return [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
    ];
}

function polygon(
    id: string,
    points: MapPoint[],
    extra: Partial<MapPolygon> = {},
): MapPolygon {
    return { id, type: "polygon", points, ...extra };
}

function config(shapes: MapRegion[]): MapConfig {
    return {
        version: "1",
        title: "World",
        width: 200,
        height: 200,
        layers: [],
        pins: [],
        shapes,
    };
}

function ok(r: RegionOpResult): MapConfig {
    if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
    return r.config;
}

function shape(cfg: MapConfig, id: string): MapPolygon {
    const s = cfg.shapes.find((x) => x.id === id);
    if (!s || s.type !== "polygon") throw new Error(`no polygon ${id}`);
    return s;
}

const italy = polygon("italy", rect(0, 0, 100, 100), {
    label: "Italy",
    color: "#0a0",
    targetPage: "Italy",
});
const vatican = polygon("vatican", rect(40, 40, 60, 60), { label: "Vatican" });
const circle: MapCircle = { id: "c", type: "circle", x: 50, y: 50, radius: 5 };

describe("cutRegionOut", () => {
    it("cuts the Vatican out of Italy and leaves the Vatican alone", () => {
        const cfg = config([italy, vatican]);
        const out = ok(cutRegionOut(cfg, "italy", "vatican"));
        const it = shape(out, "italy");
        expect(it.holes).toHaveLength(1);
        expect(it.label).toBe("Italy");
        expect(it.targetPage).toBe("Italy");
        expect(out.shapes.find((s) => s.id === "vatican")).toBe(vatican);
        expect(out.shapes.map((s) => s.id)).toEqual(["italy", "vatican"]);
    });

    it("refuses to cut a region away entirely", () => {
        const cfg = config([italy, vatican]);
        expect(cutRegionOut(cfg, "vatican", "italy")).toEqual({
            ok: false,
            reason: "wouldRemoveAll",
        });
    });

    it("reports missing regions and circles", () => {
        const cfg = config([italy, circle]);
        expect(cutRegionOut(cfg, "italy", "nope")).toEqual({
            ok: false,
            reason: "notFound",
        });
        expect(cutRegionOut(cfg, "c", "italy")).toEqual({
            ok: false,
            reason: "notPolygon",
        });
        expect(cutRegionOut(cfg, "italy", "c")).toEqual({
            ok: false,
            reason: "notPolygon",
        });
    });
});

describe("cutHole", () => {
    it("cuts a drawn hole", () => {
        const out = ok(cutHole(config([italy]), "italy", rect(10, 10, 20, 20)));
        expect(shape(out, "italy").holes).toHaveLength(1);
    });

    it("trims a drawn shape that runs past the edge into a bite", () => {
        const out = ok(
            cutHole(config([italy]), "italy", rect(90, 0, 120, 100)),
        );
        const it = shape(out, "italy");
        expect(it.holes).toBeUndefined();
        expect(piecesArea(regionPieces(it))).toBe(9000);
    });

    it("changes nothing when the drawn shape misses the region", () => {
        expect(
            cutHole(config([italy]), "italy", rect(150, 150, 160, 160)),
        ).toEqual({ ok: false, reason: "noChange" });
    });

    it("refuses a drawn shape covering the whole region", () => {
        expect(
            cutHole(config([italy]), "italy", rect(-10, -10, 110, 110)),
        ).toEqual({ ok: false, reason: "wouldRemoveAll" });
    });

    it("drops degenerate drawings without throwing", () => {
        expect(
            cutHole(config([italy]), "italy", [
                { x: 1, y: 1 },
                { x: 2, y: 2 },
            ]),
        ).toEqual({ ok: false, reason: "noChange" });
    });
});

describe("fillHole", () => {
    it("fuses an island merged into a lake when the lake is filled", () => {
        const lakeWithIsland = polygon("A", rect(0, 0, 100, 100), {
            holes: [rect(30, 30, 70, 70)],
            parts: [{ points: rect(40, 40, 60, 60) }],
        });
        const out = ok(
            fillHole(config([lakeWithIsland]), "A", { x: 35, y: 35 }),
        );
        const a = shape(out, "A");
        expect(regionPieces(a)).toHaveLength(1);
        expect(a.holes).toBeUndefined();
        expect(regionArea(a)).toBe(10000);
    });

    it("removes the hole under the point", () => {
        const cut = ok(
            cutRegionOut(config([italy, vatican]), "italy", "vatican"),
        );
        const out = ok(fillHole(cut, "italy", { x: 50, y: 50 }));
        expect("holes" in shape(out, "italy")).toBe(false);
    });

    it("changes nothing when the point is not in a hole", () => {
        expect(fillHole(config([italy]), "italy", { x: 50, y: 50 })).toEqual({
            ok: false,
            reason: "noChange",
        });
    });
});

describe("mergeRegions", () => {
    const a = polygon("A", rect(0, 0, 10, 10), {
        label: "Nation",
        color: "#f00",
        layerId: "L1",
        targetPage: "Nation",
    });
    const b = polygon("B", rect(20, 20, 30, 30), { label: "B", layerId: "L2" });
    const c = polygon("C", rect(40, 40, 50, 50), { label: "C" });
    const other = polygon("X", rect(100, 100, 110, 110));

    it("folds the picked regions into the target", () => {
        const cfg = config([other, a, b, c]);
        const out = ok(mergeRegions(cfg, "A", ["B", "C"]));
        expect(out.shapes.map((s) => s.id)).toEqual(["X", "A"]);
        const merged = shape(out, "A");
        expect(merged.label).toBe("Nation");
        expect(merged.color).toBe("#f00");
        expect(merged.layerId).toBe("L1");
        expect(merged.targetPage).toBe("Nation");
        expect(regionPieces(merged)).toHaveLength(3);
    });

    it("fills the target's hole with a region merged into it", () => {
        const holey = polygon("A", rect(0, 0, 100, 100), {
            holes: [rect(40, 40, 60, 60)],
        });
        const plug = polygon("P", rect(40, 40, 60, 60));
        const out = ok(mergeRegions(config([holey, plug]), "A", ["P"]));
        const merged = shape(out, "A");
        expect(regionPieces(merged)).toHaveLength(1);
        expect(merged.holes).toBeUndefined();
    });

    it("ignores unknown ids, circles and the target itself", () => {
        const cfg = config([a, circle]);
        expect(mergeRegions(cfg, "A", ["nope", "c", "A"])).toEqual({
            ok: false,
            reason: "noChange",
        });
        expect(cfg.shapes).toHaveLength(2);
    });
});

describe("splitRegion", () => {
    it("turns each piece back into its own region", () => {
        const merged = polygon("A", rect(0, 0, 10, 10), {
            label: "Nation",
            color: "#f00",
            targetPage: "Nation",
            parts: [
                { points: rect(20, 20, 25, 25) },
                { points: rect(40, 40, 48, 48), holes: [rect(42, 42, 44, 44)] },
            ],
        });
        const ids = ["n1", "n2"];
        const out = ok(
            splitRegion(config([merged, vatican]), "A", () => ids.shift()!),
        );
        expect(out.shapes.map((s) => s.id)).toEqual([
            "A",
            "n1",
            "n2",
            "vatican",
        ]);
        for (const id of ["A", "n1", "n2"]) {
            const s = shape(out, id);
            expect(s.label).toBe("Nation");
            expect(s.color).toBe("#f00");
            expect(s.targetPage).toBe("Nation");
            expect("parts" in s).toBe(false);
        }
        expect(shape(out, "A").points).toEqual(rect(0, 0, 10, 10));
        expect(shape(out, "n1").holes).toEqual([rect(42, 42, 44, 44)]);
        expect(shape(out, "n2").points).toEqual(rect(20, 20, 25, 25));
    });

    it("changes nothing for a one-piece region", () => {
        expect(splitRegion(config([italy]), "italy", () => "x")).toEqual({
            ok: false,
            reason: "noChange",
        });
    });
});

describe("menu helpers", () => {
    it("measures polygons and circles", () => {
        expect(regionArea(italy)).toBe(10000);
        expect(regionArea(circle)).toBeCloseTo(Math.PI * 25);
    });

    it("pairs the smaller region as the cutter of the larger", () => {
        expect(cutOutPairs([italy, vatican])).toEqual([
            { target: italy, cutter: vatican },
        ]);
        expect(cutOutPairs([vatican, italy])).toEqual([
            { target: italy, cutter: vatican },
        ]);
    });

    it("pairs three nested regions three ways", () => {
        const city = polygon("city", rect(45, 45, 50, 50));
        expect(cutOutPairs([italy, vatican, city])).toHaveLength(3);
    });

    it("measures a self-crossing outline by what it covers", () => {
        const bowtie = polygon("bow", [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 10, y: 0 },
            { x: 0, y: 10 },
        ]);
        expect(regionArea(bowtie)).toBeCloseTo(50);
        const small = polygon("small", rect(1, 4, 3, 6));
        expect(cutOutPairs([small, bowtie])).toEqual([
            { target: bowtie, cutter: small },
        ]);
        expect(pickMergeCandidate([bowtie, small], "x")).toBe(small);
    });

    it("skips circles and equal areas", () => {
        const twin = polygon("twin", rect(0, 0, 100, 100));
        expect(cutOutPairs([italy, circle])).toEqual([]);
        expect(cutOutPairs([italy, twin])).toEqual([]);
    });

    it("finds regions with a hole under the point", () => {
        const holey = shape(
            ok(cutRegionOut(config([italy, vatican]), "italy", "vatican")),
            "italy",
        );
        expect(
            regionsWithHoleAt([holey, vatican, circle], { x: 50, y: 50 }),
        ).toEqual([holey]);
        expect(regionsWithHoleAt([holey], { x: 5, y: 5 })).toEqual([]);
    });

    it("picks the smallest region that isn't the merge target", () => {
        const city = polygon("city", rect(45, 45, 50, 50));
        expect(pickMergeCandidate([italy, vatican, city], "italy")).toBe(city);
        expect(pickMergeCandidate([italy, circle], "italy")).toBeNull();
        expect(pickMergeCandidate([italy], "italy")).toBeNull();
    });
});

describe("purity", () => {
    it("never mutates the config it is given", () => {
        const merged = polygon("A", rect(0, 0, 10, 10), {
            parts: [{ points: rect(20, 20, 25, 25) }],
        });
        const cfg = config([italy, vatican, merged]);
        const before = structuredClone(cfg);
        cutRegionOut(cfg, "italy", "vatican");
        cutHole(cfg, "italy", rect(1, 1, 5, 5));
        fillHole(cfg, "italy", { x: 50, y: 50 });
        mergeRegions(cfg, "italy", ["A"]);
        splitRegion(cfg, "A", () => "z");
        expect(cfg).toEqual(before);
    });
});

describe("menu helpers stay cheap on big maps", () => {
    afterEach(() => vi.restoreAllMocks());

    it("doesn't measure anything when there's nothing to compare", () => {
        const union = vi.spyOn(polygonClipping, "union");
        const lone = polygon("lone", rect(0, 0, 10, 10));
        const target = polygon("t", rect(0, 0, 50, 50));
        expect(cutOutPairs([lone, circle])).toEqual([]);
        expect(pickMergeCandidate([target, lone], "t")).toBe(lone);
        expect(union).not.toHaveBeenCalled();
    });

    it("trusts the plain area of a very large outline", () => {
        const n = 5000;
        const coast = Array.from({ length: n }, (_, i) => ({
            x: 500 + 400 * Math.cos((i / n) * 2 * Math.PI),
            y: 500 + 400 * Math.sin((i / n) * 2 * Math.PI),
        }));
        const union = vi.spyOn(polygonClipping, "union");
        expect(regionArea(polygon("coast", coast))).toBeCloseTo(
            Math.PI * 400 * 400,
            -3,
        );
        expect(union).not.toHaveBeenCalled();
    });
});

describe("hasMergePartner", () => {
    it("needs another outline region to merge with", () => {
        expect(hasMergePartner([italy], "italy")).toBe(false);
        expect(hasMergePartner([italy, circle], "italy")).toBe(false);
        expect(hasMergePartner([italy, vatican], "italy")).toBe(true);
    });
});
