/**
 * @file Pure utility functions for Map domain logic.
 * Handles geometry calculations, and shape intersections.
 */

import type { MapConfig, MapRegion } from "./mapModels";

/**
 * Standard Ray-casting algorithm to check if a point is inside a polygon.
 */
export function isPointInPolygon(
    pt: { x: number; y: number },
    polygon: { x: number; y: number }[]
): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x,
            yi = polygon[i].y;
        const xj = polygon[j].x,
            yj = polygon[j].y;

        const intersect =
            yi > pt.y !== yj > pt.y &&
            pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Checks if a point is inside a circle.
 */
export function isPointInCircle(
    pt: { x: number; y: number },
    circle: { x: number; y: number; radius: number }
): boolean {
    const dx = pt.x - circle.x;
    const dy = pt.y - circle.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= circle.radius;
}

/**
 * Returns all regions (shapes) that contain the given point.
 */
export function getShapesAtPoint(
    mapX: number,
    mapY: number,
    shapes: MapRegion[] = []
): MapRegion[] {
    return shapes.filter((shape) => {
        if (shape.type === "circle") {
            return isPointInCircle({ x: mapX, y: mapY }, shape);
        } else if (shape.type === "polygon") {
            return isPointInPolygon({ x: mapX, y: mapY }, shape.points);
        }
        return false;
    });
}
