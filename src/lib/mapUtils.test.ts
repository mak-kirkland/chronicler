import { describe, it, expect } from "vitest";
import type { MapConfig, MapPoint, MapPolygon, MapRegion } from "./mapModels";
import {
    ShapeSpatialIndex,
    getShapesAtPoint,
    shapeFingerprint,
    resizeMapData,
    mapModeKeyAction,
    isPointInPolygon,
    regionStyleState,
    pinDropPoint,
    movePinTo,
    findPlace,
    placeLabels,
    regionBounds,
    pinFocusZoom,
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

describe("regionStyleState", () => {
    const idle = {
        isConsoleOpen: false,
        drawMode: null,
        holeTargetId: null,
        mergeTargetId: null,
        mergePickIds: new Set<string>(),
        highlightedRegionId: null,
        hoveredRegionIds: new Set<string>(),
    };
    const ids = (s: Set<string>) => [...s].sort();

    it("keeps regions hidden, hover-highlighted, when just viewing", () => {
        const r = regionStyleState({
            ...idle,
            hoveredRegionIds: new Set(["a"]),
        });
        expect(r.mode).toBe("hidden");
        expect(ids(r.targeted)).toEqual(["a"]);
    });

    it("shows every region while drawing a new region, highlighting none", () => {
        const r = regionStyleState({
            ...idle,
            drawMode: "polygon",
            hoveredRegionIds: new Set(["stale-hover"]),
        });
        expect(r.mode).toBe("visible");
        expect(ids(r.targeted)).toEqual([]);
    });

    it("shows every region while drawing a hole, highlighting the one being cut", () => {
        const r = regionStyleState({
            ...idle,
            drawMode: "hole",
            holeTargetId: "italy",
            hoveredRegionIds: new Set(["stale-hover"]),
        });
        expect(r.mode).toBe("visible");
        expect(ids(r.targeted)).toEqual(["italy"]);
    });

    it("shows every region while merging, highlighting target and picks", () => {
        const r = regionStyleState({
            ...idle,
            mergeTargetId: "A",
            mergePickIds: new Set(["B"]),
            hoveredRegionIds: new Set(["stale-hover"]),
        });
        expect(r.mode).toBe("visible");
        expect(ids(r.targeted)).toEqual(["A", "B"]);
    });

    it("shows every region with the console open, highlighting hover and console", () => {
        const r = regionStyleState({
            ...idle,
            isConsoleOpen: true,
            highlightedRegionId: "c",
            hoveredRegionIds: new Set(["a"]),
        });
        expect(r.mode).toBe("visible");
        expect(ids(r.targeted)).toEqual(["a", "c"]);
    });
});

describe("pinDropPoint", () => {
    it("rounds to whole image pixels", () => {
        expect(pinDropPoint(10.4, 20.6, 100, 50)).toEqual({ x: 10, y: 21 });
    });

    it("parks a pin dragged off the image on its edge", () => {
        expect(pinDropPoint(-30, 70, 100, 50)).toEqual({ x: 0, y: 50 });
        expect(pinDropPoint(140, -2, 100, 50)).toEqual({ x: 100, y: 0 });
    });
});

describe("movePinTo", () => {
    const cfg: MapConfig = {
        version: "1",
        title: "t",
        width: 100,
        height: 50,
        layers: [],
        pins: [
            { id: "a", x: 10, y: 10, label: "A", targetPage: "Alpha" },
            { id: "b", x: 20, y: 20 },
        ],
        shapes: [],
    };

    it("moves only that pin and keeps everything else about it", () => {
        const next = movePinTo(cfg, "a", 40.2, 30.7);
        expect(next.pins).toEqual([
            { id: "a", x: 40, y: 31, label: "A", targetPage: "Alpha" },
            { id: "b", x: 20, y: 20 },
        ]);
        expect(next.pins[1]).toBe(cfg.pins[1]);
        expect(cfg.pins[0]).toEqual({
            id: "a",
            x: 10,
            y: 10,
            label: "A",
            targetPage: "Alpha",
        });
    });

    it("keeps the pin on the image", () => {
        const next = movePinTo(cfg, "b", 500, -9);
        expect(next.pins[1]).toEqual({ id: "b", x: 100, y: 0 });
    });

    it("hands back the same config when nothing moves, so nothing is written", () => {
        expect(movePinTo(cfg, "a", 10.3, 9.8)).toBe(cfg);
        // Deleted elsewhere while it was being dragged.
        expect(movePinTo(cfg, "gone", 5, 5)).toBe(cfg);
    });
});

describe("findPlace", () => {
    const castleRegion: MapPolygon = {
        id: "r-castle",
        type: "polygon",
        label: "Castle",
        points: rect(0, 0, 10, 10),
    };
    const cfg: MapConfig = {
        version: "1",
        title: "t",
        width: 100,
        height: 100,
        layers: [
            {
                id: "L1",
                name: "Hidden",
                image: "",
                opacity: 1,
                zIndex: 0,
                visible: false,
            },
            {
                id: "L2",
                name: "Shown",
                image: "",
                opacity: 1,
                zIndex: 1,
                visible: true,
            },
        ],
        pins: [
            { id: "gate1", x: 1, y: 1, label: "Gate" },
            { id: "castle", x: 5, y: 5, label: "Castle" },
            { id: "gate2", x: 2, y: 2, label: "Gate" },
            { id: "secret", x: 3, y: 3, label: "Secret", layerId: "L1" },
            { id: "lost", x: 4, y: 4, label: "Lost", layerId: "gone" },
            {
                id: "inn",
                x: 6,
                y: 6,
                label: 'The Fox & "Hound"',
                layerId: "L2",
            },
        ],
        shapes: [
            castleRegion,
            { ...castleRegion, id: "r-moor", label: "Moor" },
        ],
    };

    it("prefers a pin over a region with the same label", () => {
        const m = findPlace(cfg, "Castle");
        expect(m?.kind).toBe("pin");
        expect(m?.kind === "pin" && m.pin.id).toBe("castle");
    });

    it("ignores case and surrounding spaces", () => {
        expect(findPlace(cfg, "  castle  ")?.kind).toBe("pin");
    });

    it("takes the first of two same-labelled pins", () => {
        const m = findPlace(cfg, "Gate");
        expect(m?.kind === "pin" && m.pin.id).toBe("gate1");
    });

    it("finds regions and reports a hidden layer to reveal", () => {
        const moor = findPlace(cfg, "Moor");
        expect(moor?.kind === "region" && moor.region.id).toBe("r-moor");
        expect(moor?.hiddenLayerId).toBeNull();
        expect(findPlace(cfg, "Secret")?.hiddenLayerId).toBe("L1");
        expect(findPlace(cfg, 'The Fox & "Hound"')?.hiddenLayerId).toBeNull();
    });

    it("skips objects on a layer that no longer exists, and unknown places", () => {
        expect(findPlace(cfg, "Lost")).toBeNull();
        expect(findPlace(cfg, "Nowhere")).toBeNull();
    });

    it("never offers a label a link can't spell", () => {
        // `#`, `|`, `[` and `]` end or break a `[[map:Name#Place]]` link.
        const odd = {
            ...cfg,
            pins: [
                { id: "r3", x: 0, y: 0, label: "Room #3" },
                { id: "ab", x: 0, y: 0, label: "A|B" },
                { id: "br", x: 0, y: 0, label: "[Ruins]" },
                { id: "ok", x: 0, y: 0, label: "Room 4" },
            ],
            shapes: [],
        };
        expect(placeLabels(odd)).toEqual([{ label: "Room 4", kind: "pin" }]);
    });

    it("lists each label once, pins first, without blanks or lost objects", () => {
        const labels = placeLabels({
            ...cfg,
            pins: [
                ...cfg.pins,
                { id: "blank", x: 0, y: 0, label: "  " },
                { id: "x", x: 0, y: 0 },
            ],
        });
        expect(labels).toEqual([
            { label: "Gate", kind: "pin" },
            { label: "Castle", kind: "pin" },
            { label: "Secret", kind: "pin" },
            { label: 'The Fox & "Hound"', kind: "pin" },
            { label: "Moor", kind: "region" },
        ]);
    });
});

describe("pinFocusZoom", () => {
    it("uses the native level on a big map, where it's already a close-up", () => {
        expect(pinFocusZoom(5, 3.2, 6)).toBe(5);
    });

    it("zooms past the native level on a small map that fits at a higher zoom", () => {
        // 1000×800 image: native level 1, but the whole map fits at ~1.14.
        expect(pinFocusZoom(1, 1.9, 2)).toBe(1.9);
    });

    it("never passes the map's max zoom", () => {
        expect(pinFocusZoom(1, 2.6, 2)).toBe(2);
    });
});

describe("regionBounds", () => {
    it("covers every piece of a polygon", () => {
        expect(regionBounds(islands)).toEqual({
            minX: 0,
            minY: 0,
            maxX: 90,
            maxY: 90,
        });
    });

    it("covers a circle", () => {
        expect(
            regionBounds({ id: "c", type: "circle", x: 10, y: 20, radius: 5 }),
        ).toEqual({
            minX: 5,
            minY: 15,
            maxX: 15,
            maxY: 25,
        });
    });
});
