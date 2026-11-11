/**
 * @file Utilities for Map domain logic.
 * Handles geometry calculations, coordinate scaling, shape intersections,
 * and centralized theme assets (icons, colors).
 */

import type {
    MapConfig,
    MapLayer,
    MapPoint,
    MapPolygon,
    MapPolygonPart,
    MapRegion,
} from "./mapModels";
import type L from "leaflet";
import { isPointInRegion, piecesBounds, regionPieces } from "./mapGeometry";

// --- THEME CONSTANTS ---

export const DEFAULT_SHAPE_COLOR = "#3498db";
export const DEFAULT_PIN_ICON = "📍";
export const DEFAULT_ICON_COLOR = "#ffffff";
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

/**
 * Convert Leaflet lat to image pixel Y (top=0, increases downward).
 *
 * MapView uses a custom Y-down CRS, so Leaflet lat == image Y directly —
 * this is an identity pass. Kept as a semantic indirection so callers
 * express intent and so the coordinate system can change again with a
 * single edit. The `mapHeight` parameter is unused but kept in the
 * signature for the same reason.
 */
export function toMapY(leafletLat: number, _mapHeight: number): number {
    return leafletLat;
}

// --- LAYER VISIBILITY ---

/**
 * Returns true if a map object should be visible based on its layer assignment.
 * An object is visible if it has no assigned layer (global) or its layer exists and is visible.
 *
 * For hot loops (per-pin / per-shape inside a sync pass) prefer
 * {@link buildLayerVisibilityLookup} + {@link isLayerIdVisible}: the array
 * scan here is O(layers) per call and adds up fast on dense maps.
 */
export function isLayerVisible(
    layerId: string | undefined,
    layers: MapLayer[],
): boolean {
    if (!layerId) return true;
    const layer = layers.find((l) => l.id === layerId);
    return layer ? layer.visible : false;
}

/**
 * Precomputed `layerId → visible` lookup. Build once at the top of a sync
 * pass with {@link buildLayerVisibilityLookup}, then call this per item — O(1)
 * instead of the O(layers) array scan {@link isLayerVisible} does.
 */
export type LayerVisibilityLookup = Map<string, boolean>;

export function buildLayerVisibilityLookup(
    layers: MapLayer[],
): LayerVisibilityLookup {
    const lookup = new Map<string, boolean>();
    for (const layer of layers) lookup.set(layer.id, layer.visible);
    return lookup;
}

export function isLayerIdVisible(
    lookup: LayerVisibilityLookup,
    layerId: string | undefined,
): boolean {
    if (!layerId) return true;
    // Mirror isLayerVisible: unknown layer = treat as hidden.
    return lookup.get(layerId) ?? false;
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
            // Plain outlines keep whole-pixel coordinates as they always
            // have. Regions with holes or extra pieces keep 2 decimals (like
            // the geometry ops) — rounding each ring to whole pixels
            // independently can push a hole vertex across a slanted outline
            // edge, where even-odd fill paints a sliver outside the region.
            const precise = !!(shape.holes || shape.parts);
            const round = precise
                ? (v: number) => Math.round(v * scaleFactor * 100) / 100
                : (v: number) => Math.round(v * scaleFactor);
            const scaleRing = (ring: MapPoint[]) =>
                ring.map((p) => ({ x: round(p.x), y: round(p.y) }));
            const scaled: MapPolygon = {
                ...shape,
                points: scaleRing(shape.points),
            };
            if (shape.holes) scaled.holes = shape.holes.map(scaleRing);
            if (shape.parts) {
                scaled.parts = shape.parts.map((part) => {
                    const p: MapPolygonPart = {
                        points: scaleRing(part.points),
                    };
                    if (part.holes) p.holes = part.holes.map(scaleRing);
                    return p;
                });
            }
            return scaled;
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
 * True when the point is inside a polygon region: inside one of its pieces
 * and not inside that piece's holes. Plain one-outline regions (the common
 * case, and the hot path on every mousemove) skip the pieces machinery.
 */
export function isPointInPolygonRegion(
    pt: MapPoint,
    shape: MapPolygon,
): boolean {
    if (!shape.holes && !shape.parts) return isPointInPolygon(pt, shape.points);
    return isPointInRegion(pt, shape);
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
            return isPointInPolygonRegion({ x: mapX, y: mapY }, shape);
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
    } else if (shape.parts) {
        // Holes sit inside their outlines, so only outlines matter here.
        return piecesBounds(regionPieces(shape));
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
     * Query all shapes whose AABB intersects the given rectangle.
     * Used for viewport culling — fast broad-phase only, no narrow-phase.
     */
    queryBounds(
        minX: number,
        minY: number,
        maxX: number,
        maxY: number,
    ): MapRegion[] {
        const minCX = Math.floor(minX / this.cellSize);
        const minCY = Math.floor(minY / this.cellSize);
        const maxCX = Math.floor(maxX / this.cellSize);
        const maxCY = Math.floor(maxY / this.cellSize);

        const seen = new Set<string>();
        const results: MapRegion[] = [];
        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cy = minCY; cy <= maxCY; cy++) {
                const bucket = this.grid.get(this.cellKey(cx, cy));
                if (!bucket) continue;
                for (const shape of bucket) {
                    if (seen.has(shape.id)) continue;
                    const aabb = this.aabbMap.get(shape.id)!;
                    if (
                        aabb.maxX < minX ||
                        aabb.minX > maxX ||
                        aabb.maxY < minY ||
                        aabb.minY > maxY
                    )
                        continue;
                    seen.add(shape.id);
                    results.push(shape);
                }
            }
        }
        return results;
    }

    /**
     * Query all shapes containing the given point.
     * Uses AABB broad-phase, then exact geometry narrow-phase.
     */
    query(
        mapX: number,
        mapY: number,
        layers?: MapLayer[] | LayerVisibilityLookup,
    ): MapRegion[] {
        const cx = Math.floor(mapX / this.cellSize);
        const cy = Math.floor(mapY / this.cellSize);
        const candidates = this.grid.get(this.cellKey(cx, cy));
        if (!candidates) return [];

        // Hot path: this runs on every throttled mousemove. Resolve the
        // visibility check once outside the loop instead of paying an
        // `instanceof Map` per shape.
        const lookup =
            layers instanceof Map
                ? layers
                : layers
                  ? buildLayerVisibilityLookup(layers)
                  : null;

        // Deduplicate: shapes spanning multiple cells may appear multiple times,
        // but within a single cell bucket there are no duplicates.
        // Since we query exactly one cell, no dedup needed.
        const results: MapRegion[] = [];
        for (const shape of candidates) {
            if (lookup && !isLayerIdVisible(lookup, shape.layerId)) continue;

            // AABB check (fast reject)
            const aabb = this.aabbMap.get(shape.id)!;
            if (mapX < aabb.minX || mapX > aabb.maxX || mapY < aabb.minY || mapY > aabb.maxY) continue;

            // Exact geometry check
            if (shape.type === "circle") {
                if (isPointInCircle({ x: mapX, y: mapY }, shape)) results.push(shape);
            } else if (shape.type === "polygon") {
                if (isPointInPolygonRegion({ x: mapX, y: mapY }, shape)) results.push(shape);
            }
        }
        return results;
    }
}

/**
 * Generates a fingerprint string for a MapRegion that captures all properties
 * which affect its Leaflet rendering. Used for diff-based sync.
 */
export function shapeFingerprint(shape: MapRegion): string {
    if (shape.type === "polygon") {
        const ring = (r: MapPoint[]) => r.map((p) => `${p.x},${p.y}`).join(";");
        const part = (p: MapPolygonPart) =>
            [p.points, ...(p.holes ?? [])].map(ring).join("/");
        const pts = ring(shape.points);
        // Appended only when present so plain polygons keep their old
        // fingerprint (no needless rebuild after an upgrade).
        const holes = shape.holes
            ? `|h:${shape.holes.map(ring).join("/")}`
            : "";
        const parts = shape.parts
            ? `|p:${shape.parts.map(part).join("&")}`
            : "";
        return `poly|${pts}|${shape.color || ""}|${shape.label || ""}|${shape.targetPage || ""}|${shape.targetMap || ""}|${shape.layerId || ""}${holes}${parts}`;
    } else {
        return `circ|${shape.x},${shape.y},${shape.radius}|${shape.color || ""}|${shape.label || ""}|${shape.targetPage || ""}|${shape.targetMap || ""}|${shape.layerId || ""}`;
    }
}

// --- MAP MODE KEYBOARD ---

/** What a keydown should do to MapView's drawing / merge-pick modes. */
export type MapModeKeyAction = "cancelDrawing" | "cancelMerge" | "finishMerge";

/**
 * Decides what a window keydown means for MapView's modes. MapView listens on
 * the window, so this guards against keys meant for something else:
 * - an unfocused pane (background tab, other split pane) never reacts;
 * - typing in a text field never reacts;
 * - Enter on a focused button/link is left to activate that control (so
 *   Enter on "Cancel Merge" doesn't merge). Escape still cancels.
 *
 * @param target what the event came from: "text" (input, textarea, select,
 *   contenteditable), "control" (button, link, role=button) or "other".
 */
export function mapModeKeyAction(
    key: string,
    state: {
        isFocused: boolean;
        isDrawing: boolean;
        isMerging: boolean;
        target: "text" | "control" | "other";
    },
): MapModeKeyAction | null {
    if (!state.isFocused || state.target === "text") return null;
    if (key === "Escape") {
        if (state.isDrawing) return "cancelDrawing";
        if (state.isMerging) return "cancelMerge";
        return null;
    }
    if (key === "Enter" && state.isMerging && state.target !== "control") {
        return "finishMerge";
    }
    return null;
}
