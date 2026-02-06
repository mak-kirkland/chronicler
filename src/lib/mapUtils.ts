/**
 * @file Utilities for Map domain logic.
 * Handles geometry calculations, coordinate scaling, shape intersections,
 * and centralized theme assets (icons, colors).
 */

import type { MapConfig, MapLayer, MapRegion } from "./mapModels";
import L from "leaflet";

// --- THEME CONSTANTS ---

export const DEFAULT_SHAPE_COLOR = "#3498db";
export const DEFAULT_PIN_ICON = "📍";
export const DEFAULT_ICON_COLOR = "#ffffff";
export const DEFAULT_STROKE_COLOR = "#444444";
export const HIGHLIGHT_STROKE_COLOR = "#ffffff";
export const DRAWING_COLOR = "#e74c3c"; // Red

// UI Icons (Chars)
export const GHOST_ICON = "👻";
export const REGION_ICON_CIRCLE = "⚪";
export const REGION_ICON_POLYGON = "⬠";

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

// --- REGION STYLE PRESETS ---

/**
 * Centralized style definitions for map regions in different states.
 * Used by MapView's reactive styling effects.
 */
export const REGION_STYLES = {
    /** High visibility — hovered or highlighted from console */
    highlighted: {
        stroke: true,
        weight: 4,
        fillOpacity: 0.5,
        dashArray: undefined,
    } as L.PathOptions,
    /** Normal visibility — console/edit mode open */
    visible: {
        stroke: true,
        weight: 2,
        fillOpacity: 0.2,
        dashArray: undefined,
    } as L.PathOptions,
    /** Invisible but interactive — default viewing mode */
    hidden: {
        stroke: false,
        fillOpacity: 0,
    } as L.PathOptions,
} as const;

// --- SVG SANITIZATION ---

/**
 * Escapes a string for safe embedding in SVG/XML text content.
 * Prevents injection of markup through pin labels or emoji fields.
 */
function escapeSvgText(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Sanitizes a hex color string. Returns the color if valid, otherwise a fallback.
 */
function sanitizeColor(color: string, fallback: string): string {
    // Allow 3/4/6/8-digit hex colors
    if (/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)) {
        return color;
    }
    return fallback;
}

// --- LAYER VISIBILITY ---

/**
 * Returns true if a map object should be visible based on its layer assignment.
 * An object is visible if it has no assigned layer (global) or its layer exists and is visible.
 *
 * @param layerId The layer ID assigned to the object, or undefined for global objects.
 * @param layers The array of map layers to check against.
 */
export function isLayerVisible(
    layerId: string | undefined,
    layers: MapLayer[],
): boolean {
    if (!layerId) return true;
    const layer = layers.find((l) => l.id === layerId);
    return layer ? layer.visible : false;
}

// --- SET UTILITIES ---

/**
 * Checks if two sets contain the same elements.
 */
export function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) {
        if (!b.has(v)) return false;
    }
    return true;
}

// --- IMAGE & GEOMETRY UTILITIES ---

/**
 * Loads an image to detect its natural dimensions.
 */
export function detectImageDimensions(
    src: string,
): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () =>
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = (err) => reject(err);
        img.src = src;
    });
}

/**
 * Result of validating a layer image against the map's reference dimensions.
 */
export interface LayerImageCheck {
    /** Blocking error (e.g. aspect ratio mismatch). Null if OK. */
    error: string | null;
    /** Non-blocking warning (e.g. rescale notice). Null if none. */
    warning: string | null;
    /** Scale factor relative to reference dimensions. 1 = same size. */
    scaleFactor: number;
    /** Detected dimensions, or null on failure. */
    dimensions: { width: number; height: number } | null;
}

/**
 * Loads an image and checks its dimensions against reference map dimensions.
 * Returns an error on aspect ratio mismatch, a warning if the image is a
 * different size (but same ratio), or neither if dimensions match exactly.
 *
 * @param imageSrc  A loadable URL for the image (e.g. from `convertFileSrc`).
 * @param refWidth  The reference map width to compare against.
 * @param refHeight The reference map height to compare against.
 * @param layerName Optional layer name included in messages for context.
 */
export async function checkLayerImage(
    imageSrc: string,
    refWidth: number,
    refHeight: number,
    layerName?: string,
): Promise<LayerImageCheck> {
    const SCALE_EPSILON = 0.001;
    const prefix = layerName ? `Layer "${layerName}": ` : "";

    let dims: { width: number; height: number };
    try {
        dims = await detectImageDimensions(imageSrc);
    } catch {
        return {
            error: prefix + "Could not load image to verify dimensions.",
            warning: null,
            scaleFactor: 1,
            dimensions: null,
        };
    }

    const scaleFactor = dims.width / refWidth;

    // Strict aspect ratio check: the image must be an exact integer scale of the
    // reference dimensions (i.e. both axes scale by the same factor).
    const expectedHeight = Math.round(refHeight * scaleFactor);
    if (dims.height !== expectedHeight) {
        const newRatio = (dims.width / dims.height).toFixed(4);
        const refRatio = (refWidth / refHeight).toFixed(4);
        return {
            error:
                prefix +
                `Aspect ratio mismatch. Map is ${refWidth}×${refHeight} (${refRatio}), ` +
                `but the image is ${dims.width}×${dims.height} (${newRatio}).`,
            warning: null,
            scaleFactor,
            dimensions: dims,
        };
    }

    const warning =
        Math.abs(scaleFactor - 1) > SCALE_EPSILON
            ? prefix +
              `Coordinates will be rescaled by ${(scaleFactor * 100).toFixed(1)}%.`
            : null;

    return {
        error: null,
        warning,
        scaleFactor,
        dimensions: dims,
    };
}

/**
 * Generates the SVG string for a map pin.
 */
export function generatePinSvg(
    emoji: string,
    color: string = DEFAULT_ICON_COLOR,
    highlighted: boolean = false,
): string {
    const scale = highlighted ? 1.3 : 1;
    const safeColor = sanitizeColor(color, DEFAULT_ICON_COLOR);
    const stroke = highlighted ? HIGHLIGHT_STROKE_COLOR : DEFAULT_STROKE_COLOR;
    const strokeWidth = highlighted ? "2" : "1.5";
    const safeEmoji = escapeSvgText(emoji);

    return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="${32 * scale}" height="${48 * scale}">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24c0-6.63-5.37-12-12-12z" fill="${safeColor}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
            <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="14" font-family="Segoe UI Emoji, Apple Color Emoji, sans-serif" dy="1">${safeEmoji}</text>
        </svg>
    `;
}

/**
 * Creates a Leaflet DivIcon for a map pin.
 */
export function createEmojiIcon(
    emoji: string,
    color: string = DEFAULT_ICON_COLOR,
    highlighted: boolean = false,
    invisible: boolean = false,
): L.DivIcon {
    const scale = highlighted ? 1.3 : 1;
    const svg = generatePinSvg(emoji, color, highlighted);

    return L.divIcon({
        className: `custom-pin-marker ${highlighted ? "highlighted" : ""} ${invisible ? "ghost-pin-marker" : ""}`,
        html: svg,
        iconSize: [32 * scale, 48 * scale],
        iconAnchor: [16 * scale, 48 * scale],
        popupAnchor: [0, -48 * scale],
    });
}

/**
 * Rescales all pins and shapes in a map configuration based on a scale factor.
 * Returns a new object with the updated coordinates.
 */
export function resizeMapData(
    config: MapConfig,
    scaleFactor: number,
    newWidth: number,
    newHeight: number,
): MapConfig {
    // 1. Scale Pins
    const updatedPins = config.pins.map((pin) => ({
        ...pin,
        x: Math.round(pin.x * scaleFactor),
        y: Math.round(pin.y * scaleFactor),
    }));

    // 2. Scale Shapes
    const updatedShapes = config.shapes.map((shape) => {
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

    // 3. Scale the scale bar reference if present
    const updatedScale = config.scale
        ? {
              ...config.scale,
              pixels: Math.round(config.scale.pixels * scaleFactor),
          }
        : undefined;

    return {
        ...config,
        width: newWidth,
        height: newHeight,
        ...(updatedScale !== undefined && { scale: updatedScale }),
        pins: updatedPins,
        shapes: updatedShapes,
    };
}

/**
 * Standard Ray-casting algorithm to check if a point is inside a polygon.
 */
export function isPointInPolygon(
    pt: { x: number; y: number },
    polygon: { x: number; y: number }[],
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
    circle: { x: number; y: number; radius: number },
): boolean {
    const dx = pt.x - circle.x;
    const dy = pt.y - circle.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= circle.radius;
}

/**
 * Returns all regions (shapes) that contain the given point.
 * Optionally filters by layer visibility when `layers` is provided.
 *
 * @param mapX The X coordinate to test.
 * @param mapY The Y coordinate to test.
 * @param shapes The array of map regions to test against.
 * @param layers Optional array of map layers; when provided, only shapes on visible layers are returned.
 */
export function getShapesAtPoint(
    mapX: number,
    mapY: number,
    shapes: MapRegion[],
    layers?: MapLayer[],
): MapRegion[] {
    return shapes.filter((shape) => {
        // Filter by layer visibility if layers are provided
        if (layers && !isLayerVisible(shape.layerId, layers)) return false;

        if (shape.type === "circle") {
            return isPointInCircle({ x: mapX, y: mapY }, shape);
        } else if (shape.type === "polygon") {
            return isPointInPolygon({ x: mapX, y: mapY }, shape.points);
        }
        return false;
    });
}
