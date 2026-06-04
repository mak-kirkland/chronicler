/**
 * Pure, immutable transforms over CanvasData. Every function returns a new
 * CanvasData and never mutates its input — this is what makes undo/redo
 * snapshotting and unit testing trivial.
 */
import type { CanvasData, CanvasNodeData, CanvasEdge } from "./canvasModels";

export function addNode(data: CanvasData, node: CanvasNodeData): CanvasData {
    return { ...data, nodes: [...data.nodes, node] };
}

export function patchNode(
    data: CanvasData,
    id: string,
    patch: Partial<CanvasNodeData>,
): CanvasData {
    return {
        ...data,
        nodes: data.nodes.map((n) =>
            n.id === id ? ({ ...n, ...patch } as CanvasNodeData) : n,
        ),
    };
}

export function moveNodes(
    data: CanvasData,
    ids: string[],
    dx: number,
    dy: number,
): CanvasData {
    const set = new Set(ids);
    return {
        ...data,
        nodes: data.nodes.map((n) =>
            set.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n,
        ),
    };
}

export function removeNodes(data: CanvasData, ids: string[]): CanvasData {
    const set = new Set(ids);
    return {
        ...data,
        nodes: data.nodes.filter((n) => !set.has(n.id)),
        edges: data.edges.filter(
            (e) => !set.has(e.fromNode) && !set.has(e.toNode),
        ),
    };
}

export function addEdge(data: CanvasData, edge: CanvasEdge): CanvasData {
    return { ...data, edges: [...data.edges, edge] };
}

export function patchEdge(
    data: CanvasData,
    id: string,
    patch: Partial<CanvasEdge>,
): CanvasData {
    return {
        ...data,
        edges: data.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    };
}

export function removeEdges(data: CanvasData, ids: string[]): CanvasData {
    const set = new Set(ids);
    return { ...data, edges: data.edges.filter((e) => !set.has(e.id)) };
}
