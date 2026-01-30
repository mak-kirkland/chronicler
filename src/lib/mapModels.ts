/**
 * Defines the structure for Interactive Maps.
 * These models are shared between the frontend map renderer and the future
 * "Cartographer" map editor.
 */

/**
 * Represents a single layer in the map (e.g., Terrain, GM Overlay).
 */
export interface MapLayer {
    id: string;
    name: string;
    /**
     * The image filename.
     */
    image: string;
    /**
     * Opacity from 0.0 to 1.0
     */
    opacity: number;
    /**
     * Stacking order. Higher numbers are on top.
     */
    zIndex: number;
    /**
     * Whether this layer is currently visible.
     */
    visible: boolean;
}

/**
 * Represents an interactive pin on the map.
 */
export interface MapPin {
    id: string;
    /**
     * X coordinate (pixels from left)
     */
    x: number;
    /**
     * Y coordinate (pixels from top)
     */
    y: number;
    /**
     * The ID of the layer this pin belongs to.
     * If undefined or empty, it applies to all layers (always visible).
     */
    layerId?: string;
    /**
     * The title of the target Markdown page.
     */
    targetPage?: string;
    /**
     * The title of the target Map (filename without extension).
     * Used for nested maps (drill-down).
     */
    targetMap?: string;
    /**
     * Optional label to display on hover/always.
     */
    label?: string;
    /**
     * Optional icon/emoji for the pin.
     */
    icon?: string;
    /**
     * Optional color hex code.
     */
    color?: string;
    /**
     * If true, the pin is invisible on the map (opacity 0)
     * unless the editor/console is open.
     */
    invisible?: boolean;
}

/**
 * Represents a polygon region.
 */
export interface MapPolygon {
    id: string;
    type: 'polygon';
    /**
     * Array of points {x, y} defining the shape.
     */
    points: { x: number; y: number }[];
    /**
     * The ID of the layer this region belongs to.
     */
    layerId?: string;
    targetPage?: string;
    targetMap?: string;
    label?: string;
    color?: string; // Stroke/Fill color
}

/**
 * Represents a circular region.
 */
export interface MapCircle {
    id: string;
    type: 'circle';
    x: number;
    y: number;
    radius: number;
    /**
     * The ID of the layer this region belongs to.
     */
    layerId?: string;
    targetPage?: string;
    targetMap?: string;
    label?: string;
    color?: string;
}

/**
 * Union type for any shape region.
 */
export type MapRegion = MapPolygon | MapCircle;

/**
 * Defines the scale ratio of the map.
 */
export interface MapScale {
    /** The length of the reference line in pixels */
    pixels: number;
    /** The real-world value that line represents */
    value: number;
    /** The label for the unit (e.g., "miles", "km", "ft") */
    unit: string;
}

/**
 * The root configuration structure stored in a .cmap file.
 */
export interface MapConfig {
    version: string;
    title: string;
    /**
     * Helper note: Leaflet CRS.Simple coordinate systems don't intrinsically know
     * the image dimensions, so we store them to set the bounds correctly.
     */
    width: number;
    height: number;

    /**
     * The scale configuration for the map.
     */
    scale?: MapScale;

    layers: MapLayer[];
    pins: MapPin[];
    /**
     * List of vector shapes (polygons, circles) defined on the map.
     */
    shapes?: MapRegion[];
}
