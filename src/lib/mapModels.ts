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
     * The title of the target Markdown page.
     */
    targetPage?: string;
    /**
     * The title of the target Map (filename without extension).
     * Used for nested maps (drill-down).
     */
    targetMap?: string;
    /**
     * Optional editor metadata: Color of the pin.
     */
    color?: string;
    /**
     * Optional icon/emoji for the pin.
     */
    icon?: string;
    /**
     * Optional editor metadata: Which layer this pin "belongs" to.
     */
    layerId?: string;
    /**
     * Optional label to display on hover/always.
     */
    label?: string;
}

/**
 * The root configuration structure stored in a .map.json file.
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
    layers: MapLayer[];
    pins: MapPin[];
}
