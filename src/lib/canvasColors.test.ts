import { describe, it, expect } from "vitest";
import { colorToCss, PRESET_COLORS } from "./canvasColors";

describe("colorToCss", () => {
    it("maps a preset id to its hex", () => {
        expect(colorToCss("4")).toBe(PRESET_COLORS["4"]);
    });
    it("passes a hex string through unchanged", () => {
        expect(colorToCss("#abcdef")).toBe("#abcdef");
    });
    it("returns null when no color is set", () => {
        expect(colorToCss(undefined)).toBeNull();
    });
});
