/**
 * Pure math for the canvas viewport. The "world" layer is rendered with
 * `transform: translate(panX, panY) scale(zoom)`, so a world point (wx, wy)
 * appears on screen at (wx*zoom + panX, wy*zoom + panY).
 */

export interface Viewport {
    panX: number;
    panY: number;
    zoom: number;
}

export interface Point {
    x: number;
    y: number;
}

export interface WorldRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Screen (container-relative px) → world coordinates. */
export function screenToWorld(
    screenX: number,
    screenY: number,
    v: Viewport,
): Point {
    return {
        x: (screenX - v.panX) / v.zoom,
        y: (screenY - v.panY) / v.zoom,
    };
}

/** World → screen (container-relative px). */
export function worldToScreen(
    worldX: number,
    worldY: number,
    v: Viewport,
): Point {
    return {
        x: worldX * v.zoom + v.panX,
        y: worldY * v.zoom + v.panY,
    };
}

/**
 * Multiply zoom by `factor` (clamped to [min,max]) while keeping the world
 * point currently under (screenX, screenY) fixed on screen.
 */
export function zoomAbout(
    v: Viewport,
    factor: number,
    screenX: number,
    screenY: number,
    min: number,
    max: number,
): Viewport {
    const zoom = clamp(v.zoom * factor, min, max);
    const world = screenToWorld(screenX, screenY, v);
    return {
        zoom,
        panX: screenX - world.x * zoom,
        panY: screenY - world.y * zoom,
    };
}

export interface RectLike {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

function intersects(a: WorldRect, b: RectLike): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}

/** Returns ids of nodes whose bounding boxes intersect the marquee rect. */
export function marqueeHitTest(
    rect: WorldRect,
    nodes: RectLike[],
): string[] {
    return nodes.filter((n) => intersects(rect, n)).map((n) => n.id);
}

/**
 * Default size for a newly inserted image card: natural size, scaled down
 * (never up) so the longest side is at most `maxSide`. Degenerate
 * dimensions (zero, negative, NaN) fall back to a generic 200×150 card.
 */
export function defaultImageCardSize(
    naturalW: number,
    naturalH: number,
    maxSide = 320,
): { width: number; height: number } {
    if (
        !Number.isFinite(naturalW) ||
        !Number.isFinite(naturalH) ||
        naturalW <= 0 ||
        naturalH <= 0
    ) {
        return { width: 200, height: 150 };
    }
    const scale = Math.min(1, maxSide / Math.max(naturalW, naturalH));
    return {
        width: Math.max(1, Math.round(naturalW * scale)),
        height: Math.max(1, Math.round(naturalH * scale)),
    };
}

/** Normalize a drag (two corners) into a positive-size WorldRect. */
export function rectFromCorners(a: Point, b: Point): WorldRect {
    return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y),
    };
}

/**
 * Screen-space dot-grid step: the 26px world spacing scaled by zoom, doubled
 * until it is at least `minPx` so dot density stays pleasant while zoomed out.
 */
export function gridStep(zoom: number, base = 26, minPx = 13): number {
    let step = base * zoom;
    while (step < minPx) step *= 2;
    return step;
}

export type EdgeSide = "top" | "right" | "bottom" | "left";

const SIDE_DIR: Record<EdgeSide, Point> = {
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

function sideAnchor(n: RectLike, side: EdgeSide): Point {
    switch (side) {
        case "top":
            return { x: n.x + n.width / 2, y: n.y };
        case "bottom":
            return { x: n.x + n.width / 2, y: n.y + n.height };
        case "left":
            return { x: n.x, y: n.y + n.height / 2 };
        case "right":
            return { x: n.x + n.width, y: n.y + n.height / 2 };
    }
}

/** Pick facing sides from the nodes' relative center positions. */
function autoSides(a: RectLike, b: RectLike): { from: EdgeSide; to: EdgeSide } {
    const dx = b.x + b.width / 2 - (a.x + a.width / 2);
    const dy = b.y + b.height / 2 - (a.y + a.height / 2);
    if (Math.abs(dx) > Math.abs(dy)) {
        return dx >= 0
            ? { from: "right", to: "left" }
            : { from: "left", to: "right" };
    }
    return dy >= 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
}

/**
 * Cubic bezier between two nodes, anchored at side midpoints so edges meet
 * the card border instead of running under it. Sides come from the file when
 * specified (JSON Canvas fromSide/toSide), else face each other. Control
 * points extend outward from each side, further apart for longer edges.
 */
export function edgeGeometry(
    from: RectLike,
    to: RectLike,
    fromSide?: EdgeSide,
    toSide?: EdgeSide,
): { d: string; labelX: number; labelY: number } {
    const auto = autoSides(from, to);
    const fs = fromSide ?? auto.from;
    const ts = toSide ?? auto.to;
    const p = sideAnchor(from, fs);
    const q = sideAnchor(to, ts);
    const ext = clamp(Math.hypot(q.x - p.x, q.y - p.y) / 2, 30, 120);
    const c1 = { x: p.x + SIDE_DIR[fs].x * ext, y: p.y + SIDE_DIR[fs].y * ext };
    const c2 = { x: q.x + SIDE_DIR[ts].x * ext, y: q.y + SIDE_DIR[ts].y * ext };
    return {
        d: `M ${p.x} ${p.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${q.x} ${q.y}`,
        labelX: (p.x + q.x) / 2,
        labelY: (p.y + q.y) / 2,
    };
}

/**
 * Viewport that fits all nodes' bounding box within (viewW, viewH) with
 * `padding` screen px of margin. Returns a centered identity-ish view when
 * there are no nodes.
 */
export function fitToContent(
    nodes: RectLike[],
    viewW: number,
    viewH: number,
    padding: number,
    minZoom: number,
    maxZoom: number,
): Viewport {
    if (nodes.length === 0) return { panX: 0, panY: 0, zoom: 1 };
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + n.width));
    const maxY = Math.max(...nodes.map((n) => n.y + n.height));
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const zoom = clamp(
        Math.min((viewW - padding * 2) / w, (viewH - padding * 2) / h),
        minZoom,
        maxZoom,
    );
    return {
        zoom,
        panX: (viewW - w * zoom) / 2 - minX * zoom,
        panY: (viewH - h * zoom) / 2 - minY * zoom,
    };
}
