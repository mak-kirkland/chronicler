import { describe, it, expect } from "vitest";
import { createHistory } from "./canvasHistory";

describe("createHistory", () => {
    it("starts empty", () => {
        const h = createHistory<string>(10);
        expect(h.canUndo()).toBe(false);
        expect(h.canRedo()).toBe(false);
    });

    it("undo returns the pushed snapshot, redo returns the current", () => {
        const h = createHistory<string>(10);
        h.push("A"); // A = state before the change; "B" is now current
        expect(h.canUndo()).toBe(true);
        expect(h.undo("B")).toBe("A");
        expect(h.canRedo()).toBe(true);
        expect(h.redo("A")).toBe("B");
    });

    it("returns null when nothing to undo/redo", () => {
        const h = createHistory<string>(10);
        expect(h.undo("X")).toBeNull();
        expect(h.redo("X")).toBeNull();
    });

    it("push clears the redo stack", () => {
        const h = createHistory<string>(10);
        h.push("A");
        h.undo("B"); // redo now has "B"
        h.push("C"); // a new change clears redo
        expect(h.canRedo()).toBe(false);
    });

    it("bounds the undo stack to the limit", () => {
        const h = createHistory<number>(2);
        h.push(1);
        h.push(2);
        h.push(3); // 1 should be dropped
        expect(h.undo(99)).toBe(3);
        expect(h.undo(3)).toBe(2);
        expect(h.canUndo()).toBe(false); // 1 was dropped
    });
});
