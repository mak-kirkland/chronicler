import { describe, it, expect } from "vitest";
import {
    screenToWorld,
    worldToScreen,
    zoomAbout,
    marqueeHitTest,
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
