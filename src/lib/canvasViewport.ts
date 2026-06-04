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
