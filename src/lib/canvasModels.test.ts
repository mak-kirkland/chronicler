import { describe, it, expect } from "vitest";
import {
    emptyCanvas,
    genNodeId,
    toRelativePath,
    toAbsolutePath,
} from "./canvasModels";

describe("emptyCanvas", () => {
    it("has empty nodes and edges arrays", () => {
        expect(emptyCanvas()).toEqual({ nodes: [], edges: [] });
    });
    it("returns a fresh object each call", () => {
        const a = emptyCanvas();
        a.nodes.push({
            id: "x",
            type: "text",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            text: "",
        });
        expect(emptyCanvas().nodes).toHaveLength(0);
    });
});

describe("genNodeId", () => {
    it("returns a non-empty string", () => {
        expect(genNodeId().length).toBeGreaterThan(0);
    });
    it("returns unique values", () => {
        expect(genNodeId()).not.toBe(genNodeId());
    });
});

describe("path helpers", () => {
    it("makes a vault-relative path with forward slashes", () => {
        expect(toRelativePath("/vault/sub/pic.png", "/vault")).toBe(
            "sub/pic.png",
        );
    });
    it("leaves an already-relative path unchanged", () => {
        expect(toRelativePath("sub/pic.png", "/vault")).toBe("sub/pic.png");
    });
    it("resolves a relative path to absolute against the vault root", () => {
        expect(toAbsolutePath("sub/pic.png", "/vault")).toBe(
            "/vault/sub/pic.png",
        );
    });
    it("round-trips", () => {
        const abs = "/vault/a/b/c.md";
        expect(toAbsolutePath(toRelativePath(abs, "/vault"), "/vault")).toBe(
            abs,
        );
    });
});
