/**
 * @file Utilities for Map domain logic.
 * Handles geometry calculations, coordinate scaling, shape intersections,
 * and centralized theme assets (icons, colors).
 */

import type { MapConfig, MapLayer, MapPin, MapRegion } from "./mapModels";
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

// --- COORDINATE CONVERSION ---

/*
 * NOTE: These functions used to convert between image pixel Y (Y-down) and
 * Leaflet's CRS.Simple lat (Y-up). MapView now uses a custom Y-down CRS, so
 * Leaflet lat == image Y directly and these functions are identity passes.
 *
 * They're kept as a semantic abstraction layer: callers express intent
 * ("convert image Y to Leaflet lat") instead of using raw values, and if the
 * coordinate system ever changes again, only these two functions need updating.
 * The `mapHeight` parameter is unused but kept in the signature for the same
 * reason — callers don't need to change.
 */

/** Convert image pixel Y (top=0, increases downward) to Leaflet lat. */
export function toLeafletLat(mapY: number, _mapHeight: number): number {
    return mapY;
}

/** Convert Leaflet lat to image pixel Y (top=0, increases downward). */
export function toMapY(leafletLat: number, _mapHeight: number): number {
    return leafletLat;
}

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
 * LRU-bounded cache for DivIcon instances.
 * Most maps use only a handful of unique icon combos, so this avoids
 * regenerating SVG strings and DivIcon objects on every render.
 */
const iconCache = new Map<string, L.DivIcon>();
const ICON_CACHE_MAX = 256;

function iconCacheKey(emoji: string, color: string, highlighted: boolean, invisible: boolean): string {
    return `${emoji}|${color}|${highlighted ? 1 : 0}|${invisible ? 1 : 0}`;
}

/**
 * Creates a Leaflet DivIcon for a map pin.
 * Results are cached by (emoji, color, highlighted, invisible) tuple.
 */
export function createEmojiIcon(
    emoji: string,
    color: string = DEFAULT_ICON_COLOR,
    highlighted: boolean = false,
    invisible: boolean = false,
): L.DivIcon {
    const key = iconCacheKey(emoji, color, highlighted, invisible);
    const cached = iconCache.get(key);
    if (cached) return cached;

    const scale = highlighted ? 1.3 : 1;
    const svg = generatePinSvg(emoji, color, highlighted);

    const icon = L.divIcon({
        className: `custom-pin-marker ${highlighted ? "highlighted" : ""} ${invisible ? "ghost-pin-marker" : ""}`,
        html: svg,
        iconSize: [32 * scale, 48 * scale],
        iconAnchor: [16 * scale, 48 * scale],
        popupAnchor: [0, -48 * scale],
    });

    // Evict oldest entry if cache is full
    if (iconCache.size >= ICON_CACHE_MAX) {
        const firstKey = iconCache.keys().next().value;
        if (firstKey !== undefined) iconCache.delete(firstKey);
    }
    iconCache.set(key, icon);

    return icon;
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

// --- SPATIAL INDEX ---

/**
 * Axis-aligned bounding box for fast broad-phase hit testing.
 */
interface AABB {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/**
 * Computes the AABB for a map region.
 */
function computeAABB(shape: MapRegion): AABB {
    if (shape.type === "circle") {
        return {
            minX: shape.x - shape.radius,
            minY: shape.y - shape.radius,
            maxX: shape.x + shape.radius,
            maxY: shape.y + shape.radius,
        };
    } else {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of shape.points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        return { minX, minY, maxX, maxY };
    }
}

/**
 * Lightweight spatial index using a uniform grid for O(1) broad-phase lookups.
 * Rebuild when shapes change; query on every mousemove/click.
 */
export class ShapeSpatialIndex {
    private cellSize: number;
    private grid = new Map<string, MapRegion[]>();
    private aabbMap = new Map<string, AABB>();
    private shapes: MapRegion[] = [];

    constructor(shapes: MapRegion[], mapWidth: number, mapHeight: number) {
        this.shapes = shapes;
        // Choose cell size so the grid is ~50×50 at most.
        // Larger cells = fewer cells but more candidates per query.
        this.cellSize = Math.max(mapWidth, mapHeight, 1) / 50;
        this.build();
    }

    private cellKey(cx: number, cy: number): string {
        return `${cx},${cy}`;
    }

    private build(): void {
        for (const shape of this.shapes) {
            const aabb = computeAABB(shape);
            this.aabbMap.set(shape.id, aabb);

            const minCX = Math.floor(aabb.minX / this.cellSize);
            const minCY = Math.floor(aabb.minY / this.cellSize);
            const maxCX = Math.floor(aabb.maxX / this.cellSize);
            const maxCY = Math.floor(aabb.maxY / this.cellSize);

            for (let cx = minCX; cx <= maxCX; cx++) {
                for (let cy = minCY; cy <= maxCY; cy++) {
                    const key = this.cellKey(cx, cy);
                    let bucket = this.grid.get(key);
                    if (!bucket) {
                        bucket = [];
                        this.grid.set(key, bucket);
                    }
                    bucket.push(shape);
                }
            }
        }
    }

    /**
     * Query all shapes containing the given point.
     * Uses AABB broad-phase, then exact geometry narrow-phase.
     */
    query(mapX: number, mapY: number, layers?: MapLayer[]): MapRegion[] {
        const cx = Math.floor(mapX / this.cellSize);
        const cy = Math.floor(mapY / this.cellSize);
        const candidates = this.grid.get(this.cellKey(cx, cy));
        if (!candidates) return [];

        // Deduplicate: shapes spanning multiple cells may appear multiple times,
        // but within a single cell bucket there are no duplicates.
        // Since we query exactly one cell, no dedup needed.
        const results: MapRegion[] = [];
        for (const shape of candidates) {
            if (layers && !isLayerVisible(shape.layerId, layers)) continue;

            // AABB check (fast reject)
            const aabb = this.aabbMap.get(shape.id)!;
            if (mapX < aabb.minX || mapX > aabb.maxX || mapY < aabb.minY || mapY > aabb.maxY) continue;

            // Exact geometry check
            if (shape.type === "circle") {
                if (isPointInCircle({ x: mapX, y: mapY }, shape)) results.push(shape);
            } else if (shape.type === "polygon") {
                if (isPointInPolygon({ x: mapX, y: mapY }, shape.points)) results.push(shape);
            }
        }
        return results;
    }
}

/**
 * Generates a fingerprint string for a MapPin that captures all properties
 * which affect its Leaflet rendering. Used for diff-based sync.
 */
export function pinFingerprint(pin: MapPin): string {
    return `${pin.x}|${pin.y}|${pin.icon || ""}|${pin.color || ""}|${pin.label || ""}|${pin.targetPage || ""}|${pin.targetMap || ""}|${pin.layerId || ""}|${pin.invisible ? 1 : 0}`;
}

/**
 * Generates a fingerprint string for a MapRegion that captures all properties
 * which affect its Leaflet rendering. Used for diff-based sync.
 */
export function shapeFingerprint(shape: MapRegion): string {
    if (shape.type === "polygon") {
        const pts = shape.points.map((p) => `${p.x},${p.y}`).join(";");
        return `poly|${pts}|${shape.color || ""}|${shape.label || ""}|${shape.targetPage || ""}|${shape.targetMap || ""}|${shape.layerId || ""}`;
    } else {
        return `circ|${shape.x},${shape.y},${shape.radius}|${shape.color || ""}|${shape.label || ""}|${shape.targetPage || ""}|${shape.targetMap || ""}|${shape.layerId || ""}`;
    }
}
