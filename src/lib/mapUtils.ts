/**
 * @file Utilities for Map domain logic.
 * Handles geometry calculations, coordinate scaling, shape intersections,
 * and centralized theme assets (icons, colors).
 */

import type { MapConfig, MapRegion } from "./mapModels";
// --- THEME CONSTANTS ---

export const DEFAULT_SHAPE_COLOR = "#3498db";
export const DEFAULT_PIN_ICON = "📍";
export const PALETTE = [
    "#3498db", // Blue
    "#e74c3c", // Red
    "#2ecc71", // Green
    "#f1c40f", // Yellow
    "#9b59b6", // Purple
    "#e67e22", // Orange
    "#95a5a6", // Grey
    "#ffffff", // White
    "#000000", // Black
];

export const ICONS = [
    "📍",
    // Settlements & structures
    "🏰",
    "🏯",
    "🏠",
    "🛖",
    "⛺",
    "🏘️",
    "🏛️",
    "⛪",
    "⛩️",
    // Nature & Terrain
    "🌲",
    "🌳",
    "🌴",
    "🌵",
    "⛰️",
    "🏔️",
    "🌋",
    "🌊",
    "🏝️",
    "❄️",
    "🍀",
    "🍁",
    // Travel & trade
    "⚓",
    "⛵",
    // Conflict & danger
    "⚔️",
    "🛡️",
    "💀",
    "☠️",
    "🪦",
    "🔥",
    // Magic & mystery
    "✨",
    "🔮",
    "🌀",
    "🕯️",
    // Points of Interest
    "💎",
    "💰",
    "📜",
    "⚰️",
    "🏺",
    "🗝️",
    // Knowledge
    "👁️",
    "🧠",
    "⏳",
    "🔔",
    "⚖️",
    // Characters & Monsters
    "👑",
    "🐉",
    // Generic markers
    "⭐",
    "❌",
    "⭕",
    "❗",
    "❓",
    "🚩",
    "🟢",
    "🟡",
    "🔴",
    "🔵",
];

/**
 * Rescales all pins and shapes in a map configuration based on a scale factor.
 * Returns a new object with the updated coordinates.
 */
export function resizeMapData(
    config: MapConfig,
    scaleFactor: number,
    newWidth: number,
    newHeight: number
): MapConfig {
    // 1. Scale Pins
    const updatedPins = (config.pins || []).map((pin) => ({
        ...pin,
        x: Math.round(pin.x * scaleFactor),
        y: Math.round(pin.y * scaleFactor),
    }));

    // 2. Scale Shapes
    const updatedShapes = (config.shapes || []).map((shape) => {
        if (shape.type === "circle") {
            return {
                ...shape,
                x: Math.round(shape.x * scaleFactor),
                y: Math.round(shape.y * scaleFactor),
                radius: shape.radius * scaleFactor,
            };
        } else if (shape.type === "polygon") {
            return {
                ...shape,
                points: shape.points.map((p) => ({
                    x: Math.round(p.x * scaleFactor),
                    y: Math.round(p.y * scaleFactor),
                })),
            };
        }
        return shape;
    });

    return {
        ...config,
        width: newWidth,
        height: newHeight,
        pins: updatedPins,
        shapes: updatedShapes,
    };
}

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
