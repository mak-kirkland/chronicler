/**
 * TypeScript types for the open JSON Canvas format (https://jsoncanvas.org),
 * the on-disk schema for Chronicler `.canvas` files. We adopt the spec so
 * files are interoperable with Obsidian; Chronicler-specific extensions live
 * under the optional `chronicler` slot (unused in Phase 1).
 *
 * Coordinates are in canvas world units (CSS px at zoom = 1). File-node paths
 * are stored vault-relative per the spec; convert with the path helpers below.
 */

/** Preset color id ("1".."6") or hex string, per JSON Canvas. */
export type CanvasColor = string;

interface CanvasNodeBase {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: CanvasColor;
}

export interface CanvasTextNode extends CanvasNodeBase {
    type: "text";
    /** Inline markdown content. */
    text: string;
}

export interface CanvasFileNode extends CanvasNodeBase {
    type: "file";
    /** Vault-relative path to the referenced file (image or .md page). */
    file: string;
}

export interface CanvasGroupNode extends CanvasNodeBase {
    type: "group";
    label?: string;
}

export type CanvasNodeData =
    | CanvasTextNode
    | CanvasFileNode
    | CanvasGroupNode;

export type CanvasEdgeSide = "top" | "right" | "bottom" | "left";

export interface CanvasEdge {
    id: string;
    fromNode: string;
    toNode: string;
    fromSide?: CanvasEdgeSide;
    toSide?: CanvasEdgeSide;
    color?: CanvasColor;
    label?: string;
}

export interface CanvasData {
    nodes: CanvasNodeData[];
    edges: CanvasEdge[];
}

/** A fresh, valid, empty canvas document. */
export function emptyCanvas(): CanvasData {
    return { nodes: [], edges: [] };
}

/** Unique id for a node/edge. */
export function genNodeId(): string {
    return crypto.randomUUID();
}

/** Normalize backslashes to forward slashes. */
function fwd(p: string): string {
    return p.replace(/\\/g, "/");
}

/**
 * Convert an absolute (forward-slash) path to one relative to the vault root.
 * Returns the input unchanged if it is not under `vaultRoot`.
 */
export function toRelativePath(absPath: string, vaultRoot: string): string {
    const a = fwd(absPath);
    const root = fwd(vaultRoot).replace(/\/+$/, "");
    if (a.startsWith(root + "/")) return a.slice(root.length + 1);
    return a;
}

/** Resolve a vault-relative path to an absolute (forward-slash) path. */
export function toAbsolutePath(relPath: string, vaultRoot: string): string {
    const r = fwd(relPath);
    if (r.startsWith("/")) return r;
    const root = fwd(vaultRoot).replace(/\/+$/, "");
    return `${root}/${r}`;
}
