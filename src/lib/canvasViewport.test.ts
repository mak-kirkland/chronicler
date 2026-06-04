import { describe, it, expect } from "vitest";
import {
    screenToWorld,
    worldToScreen,
    zoomAbout,
    marqueeHitTest,
    defaultImageCardSize,
    gridStep,
    edgeGeometry,
    type Viewport,
    type WorldRect,
} from "./canvasViewport";

const v = (panX: number, panY: number, zoom: number): Viewport => ({
    panX,
    panY,
    zoom,
});

describe("screen/world conversion", () => {
    it("is identity at pan 0 zoom 1", () => {
        expect(screenToWorld(100, 50, v(0, 0, 1))).toEqual({ x: 100, y: 50 });
    });
    it("accounts for pan and zoom", () => {
        expect(screenToWorld(100, 100, v(50, 0, 2))).toEqual({ x: 25, y: 50 });
    });
    it("worldToScreen inverts screenToWorld", () => {
        const view = v(50, 0, 2);
        expect(worldToScreen(25, 50, view)).toEqual({ x: 100, y: 100 });
    });
});

describe("zoomAbout keeps the cursor point fixed", () => {
    it("zooms in about a point", () => {
        const next = zoomAbout(v(0, 0, 1), 2, 100, 100, 0.1, 4);
        expect(next.zoom).toBe(2);
        // the world point under (100,100) must be unchanged
        expect(screenToWorld(100, 100, next)).toEqual(
            screenToWorld(100, 100, v(0, 0, 1)),
        );
    });
    it("clamps to max zoom", () => {
        const next = zoomAbout(v(0, 0, 4), 2, 100, 100, 0.1, 4);
        expect(next.zoom).toBe(4);
    });
    it("clamps to min zoom", () => {
        const next = zoomAbout(v(0, 0, 0.1), 0.5, 100, 100, 0.1, 4);
        expect(next.zoom).toBe(0.1);
    });
});

describe("marqueeHitTest (AABB intersection in world space)", () => {
    const rect: WorldRect = { x: 0, y: 0, width: 100, height: 100 };
    const node = (id: string, x: number, y: number) => ({
        id,
        x,
        y,
        width: 20,
        height: 20,
    });
    it("includes fully-contained nodes", () => {
        expect(marqueeHitTest(rect, [node("a", 40, 40)])).toEqual(["a"]);
    });
    it("includes partially-overlapping nodes", () => {
        expect(marqueeHitTest(rect, [node("b", 90, 90)])).toEqual(["b"]);
    });
    it("excludes disjoint nodes", () => {
        expect(marqueeHitTest(rect, [node("c", 200, 200)])).toEqual([]);
    });
});

describe("defaultImageCardSize", () => {
    it("scales a landscape image down so the longest side is 320", () => {
        expect(defaultImageCardSize(1600, 800)).toEqual({
            width: 320,
            height: 160,
        });
    });
    it("scales a portrait image down so the longest side is 320", () => {
        expect(defaultImageCardSize(500, 1000)).toEqual({
            width: 160,
            height: 320,
        });
    });
    it("keeps small images at natural size (no upscaling)", () => {
        expect(defaultImageCardSize(120, 90)).toEqual({
            width: 120,
            height: 90,
        });
    });
    it("falls back to 200×150 for degenerate input", () => {
        expect(defaultImageCardSize(0, 100)).toEqual({ width: 200, height: 150 });
        expect(defaultImageCardSize(-5, 100)).toEqual({ width: 200, height: 150 });
        expect(defaultImageCardSize(NaN, 100)).toEqual({ width: 200, height: 150 });
    });
});

describe("gridStep", () => {
    it("scales the 26px base with zoom", () => {
        expect(gridStep(1)).toBe(26);
        expect(gridStep(2)).toBe(52);
    });
    it("doubles the step when dots get denser than 13px", () => {
        expect(gridStep(0.5)).toBe(13);
        expect(gridStep(0.25)).toBe(13);
        expect(gridStep(0.1)).toBeCloseTo(20.8);
    });
});

describe("edgeGeometry", () => {
    const n = (x: number, y: number) => ({ id: "n", x, y, width: 100, height: 50 });
    it("auto-picks right→left for a horizontal pair", () => {
        const g = edgeGeometry(n(0, 0), n(300, 0));
        expect(g.d.startsWith("M 100 25 C")).toBe(true);
        expect(g.d.endsWith(", 300 25")).toBe(true);
    });
    it("auto-picks bottom→top for a vertical pair", () => {
        const g = edgeGeometry(n(0, 0), n(0, 200));
        expect(g.d.startsWith("M 50 50 C")).toBe(true);
        expect(g.d.endsWith(", 50 200")).toBe(true);
    });
    it("honors explicit sides from the file", () => {
        const g = edgeGeometry(n(0, 0), n(300, 0), "top", "bottom");
        expect(g.d.startsWith("M 50 0 C")).toBe(true);
        expect(g.d.endsWith(", 350 50")).toBe(true);
    });
    it("places the label at the anchor midpoint", () => {
        const g = edgeGeometry(n(0, 0), n(300, 0));
        expect(g.labelX).toBe(200);
        expect(g.labelY).toBe(25);
    });
});
