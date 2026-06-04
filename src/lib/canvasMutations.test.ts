import { describe, it, expect } from "vitest";
import {
    addNode,
    patchNode,
    moveNodes,
    removeNodes,
    addEdge,
    patchEdge,
    removeEdges,
} from "./canvasMutations";
import type { CanvasData, CanvasTextNode, CanvasEdge } from "./canvasModels";

const text = (id: string, x = 0, y = 0): CanvasTextNode => ({
    id,
    type: "text",
    x,
    y,
    width: 100,
    height: 60,
    text: id,
});

const base = (): CanvasData => ({ nodes: [text("a"), text("b")], edges: [] });
const edge = (id: string, from: string, to: string): CanvasEdge => ({
    id,
    fromNode: from,
    toNode: to,
});

describe("node mutations", () => {
    it("addNode appends without mutating input", () => {
        const d = base();
        const next = addNode(d, text("c"));
        expect(next.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
        expect(d.nodes).toHaveLength(2);
    });
    it("patchNode updates only the matching node", () => {
        const next = patchNode(base(), "a", { color: "3" });
        expect(next.nodes.find((n) => n.id === "a")?.color).toBe("3");
        expect(next.nodes.find((n) => n.id === "b")?.color).toBeUndefined();
    });
    it("moveNodes offsets only selected nodes", () => {
        const next = moveNodes(base(), ["b"], 10, 5);
        expect(next.nodes.find((n) => n.id === "b")).toMatchObject({
            x: 10,
            y: 5,
        });
        expect(next.nodes.find((n) => n.id === "a")).toMatchObject({
            x: 0,
            y: 0,
        });
    });
    it("removeNodes also drops edges touching removed nodes", () => {
        const d: CanvasData = {
            nodes: [text("a"), text("b")],
            edges: [edge("e1", "a", "b")],
        };
        const next = removeNodes(d, ["a"]);
        expect(next.nodes.map((n) => n.id)).toEqual(["b"]);
        expect(next.edges).toHaveLength(0);
    });
});

describe("edge mutations", () => {
    it("addEdge appends", () => {
        const next = addEdge(base(), edge("e1", "a", "b"));
        expect(next.edges).toHaveLength(1);
    });
    it("patchEdge sets a label", () => {
        const d = addEdge(base(), edge("e1", "a", "b"));
        const next = patchEdge(d, "e1", { label: "loves" });
        expect(next.edges[0].label).toBe("loves");
    });
    it("removeEdges removes by id", () => {
        const d = addEdge(base(), edge("e1", "a", "b"));
        expect(removeEdges(d, ["e1"]).edges).toHaveLength(0);
    });
});
