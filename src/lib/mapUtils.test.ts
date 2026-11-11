import { describe, it, expect } from "vitest";
import type { MapConfig, MapPoint, MapPolygon, MapRegion } from "./mapModels";
import {
    ShapeSpatialIndex,
    getShapesAtPoint,
    shapeFingerprint,
    resizeMapData,
    mapModeKeyAction,
    isPointInPolygon,
} from "./mapUtils";

function rect(x0: number, y0: number, x1: number, y1: number): MapPoint[] {
    return [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
    ];
}

const italyWithHole: MapPolygon = {
    id: "italy",
    type: "polygon",
    points: rect(0, 0, 100, 100),
    holes: [rect(40, 40, 60, 60)],
};
const vatican: MapPolygon = {
    id: "vatican",
    type: "polygon",
    points: rect(40, 40, 60, 60),
};
const islands: MapPolygon = {
    id: "islands",
    type: "polygon",
    points: rect(0, 0, 10, 10),
    parts: [{ points: rect(80, 80, 90, 90) }],
};

const ids = (shapes: MapRegion[]) => shapes.map((s) => s.id).sort();

describe("ShapeSpatialIndex with holes and pieces", () => {
    it("does not hit a region inside its hole", () => {
        const index = new ShapeSpatialIndex([italyWithHole, vatican], 100, 100);
        expect(ids(index.query(50, 50))).toEqual(["vatican"]);
        expect(ids(index.query(10, 10))).toEqual(["italy"]);
    });

    it("hits a region through its second piece", () => {
        const index = new ShapeSpatialIndex([islands], 100, 100);
        expect(ids(index.query(85, 85))).toEqual(["islands"]);
        expect(ids(index.query(50, 50))).toEqual([]);
    });

    it("indexes the bounds of every piece", () => {
        const index = new ShapeSpatialIndex([islands], 100, 100);
        expect(ids(index.queryBounds(80, 80, 90, 90))).toEqual(["islands"]);
    });
});

describe("getShapesAtPoint with holes", () => {
    it("misses a region inside its hole", () => {
        expect(getShapesAtPoint(50, 50, [italyWithHole])).toEqual([]);
        expect(ids(getShapesAtPoint(85, 85, [islands]))).toEqual(["islands"]);
    });
});

describe("shapeFingerprint", () => {
    it("is unchanged for a plain polygon", () => {
        expect(shapeFingerprint(vatican)).toBe(
            "poly|40,40;60,40;60,60;40,60|||||",
        );
    });

    it("changes when a hole or a piece is added", () => {
        const plain: MapPolygon = { ...italyWithHole, holes: undefined };
        delete plain.holes;
        const withPart: MapPolygon = {
            ...plain,
            parts: [{ points: rect(200, 200, 210, 210) }],
        };
        const fps = new Set([
            shapeFingerprint(plain),
            shapeFingerprint(italyWithHole),
            shapeFingerprint(withPart),
        ]);
        expect(fps.size).toBe(3);
    });
});

describe("resizeMapData", () => {
    const cfg: MapConfig = {
        version: "1",
        title: "t",
        width: 100,
        height: 100,
        layers: [],
        pins: [],
        shapes: [
            italyWithHole,
            vatican,
            {
                ...islands,
                parts: [
                    {
                        points: rect(80, 80, 90, 90),
                        holes: [rect(82, 82, 84, 84)],
                    },
                ],
            },
        ],
    };

    it("scales holes and pieces", () => {
        const out = resizeMapData(cfg, 2, 200, 200);
        const it = out.shapes[0] as MapPolygon;
        expect(it.holes).toEqual([rect(80, 80, 120, 120)]);
        const isl = out.shapes[2] as MapPolygon;
        expect(isl.parts).toEqual([
            {
                points: rect(160, 160, 180, 180),
                holes: [rect(164, 164, 168, 168)],
            },
        ]);
    });

    it("keeps a plain polygon in the old format", () => {
        const out = resizeMapData(cfg, 2, 200, 200);
        const v = out.shapes[1] as MapPolygon;
        expect(v.points).toEqual(rect(80, 80, 120, 120));
        expect("holes" in v).toBe(false);
        expect("parts" in v).toBe(false);
    });
});

describe("mapModeKeyAction", () => {
    const base = {
        isFocused: true,
        isDrawing: false,
        isMerging: false,
        target: "other" as const,
    };

    it("ignores keys when the map pane doesn't own the keyboard", () => {
        for (const key of ["Enter", "Escape"]) {
            expect(
                mapModeKeyAction(key, {
                    ...base,
                    isFocused: false,
                    isMerging: true,
                }),
            ).toBeNull();
            expect(
                mapModeKeyAction(key, {
                    ...base,
                    isFocused: false,
                    isDrawing: true,
                }),
            ).toBeNull();
        }
    });

    it("cancels drawing on Escape", () => {
        expect(mapModeKeyAction("Escape", { ...base, isDrawing: true })).toBe(
            "cancelDrawing",
        );
    });

    it("leaves Escape alone while typing", () => {
        expect(
            mapModeKeyAction("Escape", {
                ...base,
                isDrawing: true,
                target: "text",
            }),
        ).toBeNull();
        expect(
            mapModeKeyAction("Escape", {
                ...base,
                isMerging: true,
                target: "text",
            }),
        ).toBeNull();
    });

    it("finishes and cancels a merge", () => {
        expect(mapModeKeyAction("Enter", { ...base, isMerging: true })).toBe(
            "finishMerge",
        );
        expect(mapModeKeyAction("Escape", { ...base, isMerging: true })).toBe(
            "cancelMerge",
        );
    });

    it("lets Enter activate a focused button instead of merging", () => {
        expect(
            mapModeKeyAction("Enter", {
                ...base,
                isMerging: true,
                target: "control",
            }),
        ).toBeNull();
        expect(
            mapModeKeyAction("Escape", {
                ...base,
                isMerging: true,
                target: "control",
            }),
        ).toBe("cancelMerge");
    });

    it("does nothing outside a mode", () => {
        expect(mapModeKeyAction("Enter", base)).toBeNull();
        expect(mapModeKeyAction("Escape", base)).toBeNull();
        expect(
            mapModeKeyAction("Enter", { ...base, isDrawing: true }),
        ).toBeNull();
    });
});

describe("resizeMapData keeps holes inside their outline", () => {
    it("doesn't push a hole vertex near a slanted edge outside it", () => {
        const outline = [
            { x: 0, y: 0 },
            { x: 112, y: 30 },
            { x: 6, y: 70 },
        ];
        const hole = [
            { x: 109.95, y: 29.69 },
            { x: 95, y: 32 },
            { x: 100, y: 29 },
        ];
        for (const pt of hole) expect(isPointInPolygon(pt, outline)).toBe(true);
        const cfg: MapConfig = {
            version: "1",
            title: "t",
            width: 200,
            height: 200,
            layers: [],
            pins: [],
            shapes: [
                { id: "r", type: "polygon", points: outline, holes: [hole] },
            ],
        };
        const out = resizeMapData(cfg, 1.45, 290, 290).shapes[0] as MapPolygon;
        for (const pt of out.holes![0]) {
            expect(isPointInPolygon(pt, out.points)).toBe(true);
        }
    });
});
