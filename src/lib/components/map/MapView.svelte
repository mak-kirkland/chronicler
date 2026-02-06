<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { get } from "svelte/store";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import { currentView } from "$lib/viewStores";
    import { loadedMaps, loadMapConfig, updateMapConfig } from "$lib/mapStore";
    import {
        getShapesAtPoint,
        createEmojiIcon,
        DEFAULT_SHAPE_COLOR,
        DEFAULT_ICON_COLOR,
        DRAWING_COLOR,
        DEFAULT_PIN_ICON,
    } from "$lib/mapUtils";
    import {
        imagePathLookup,
        pagePathLookup,
        mapPathLookup,
    } from "$lib/worldStore";
    import type { MapConfig, MapPin, MapRegion } from "$lib/mapModels";
    import type { PageHeader } from "$lib/bindings";
    import ErrorBox from "$lib/components/ui/ErrorBox.svelte";
    import ViewHeader from "$lib/components/views/ViewHeader.svelte";
    import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
    import MapObjectModal from "$lib/components/map/MapObjectModal.svelte";
    import ConfirmModal from "$lib/components/modals/ConfirmModal.svelte";
    import LinkPreview from "$lib/components/ui/LinkPreview.svelte";
    import MapPreview from "$lib/components/map/MapPreview.svelte";
    import { openModal, closeModal } from "$lib/modalStore";
    import Button from "$lib/components/ui/Button.svelte";
    import MapConsole from "$lib/components/map/MapConsole.svelte";
    import MapLayerControl from "$lib/components/map/MapLayerControl.svelte";
    import { hasMapsEntitlement } from "$lib/licenseStore";

    let { data } = $props<{ data: PageHeader }>();

    let mapElement: HTMLElement = $state(null!);
    let map: L.Map | null = null;

    // Layer Groups to manage different types of content
    let imageOverlays = new Map<string, L.ImageOverlay>(); // Track image layers by ID
    let markerLayerGroup: L.LayerGroup | null = null;
    let shapeLayerGroup: L.LayerGroup | null = null;
    // Temp layer for drawing in progress
    let drawLayerGroup: L.LayerGroup | null = null;

    let error = $state<string | null>(null);
    let currentMapPath: string | null = null;
    let prevConfigStr = ""; // Track config state to prevent re-renders

    // Track state to know when to fully re-init map
    // We only need to check these 3 properties. Much faster than JSON hashing.
    let prevStructure = { w: 0, h: 0, baseImage: "" };

    // Drawing State
    let isDrawing = $state(false);
    let drawMode = $state<"polygon" | null>(null);
    let tempPoints: L.LatLng[] = [];
    let tempLayer: L.Layer | null = null; // Visual feedback during draw

    // Console State
    let isConsoleOpen = $state(false);
    let highlightedPinId = $state<string | null>(null);
    let highlightedRegionId = $state<string | null>(null); // From Console Hover

    // Map Hover State
    // We use a Set to track multiple overlapping regions if necessary
    let hoveredRegionIds = $state(new Set<string>());
    let hoveredPinId = $state<string | null>(null);

    // Layer Revision State
    // Incremented whenever layers are rebuilt to force styling effects to re-run
    let layerRevision = $state(0);

    // Link Preview State
    let hoveredElement = $state<HTMLElement | null>(null);
    let hoveredPath = $state<string | null>(null);

    // Map Preview State
    let hoveredMapElement = $state<HTMLElement | null>(null);
    let hoveredMapPath = $state<string | null>(null);

    // Tooltip State for multi-region hover
    let multiTooltip: L.Tooltip | null = null;

    // Lookup for layers to support console highlighting
    let pinIdToLayer = new Map<string, L.Marker>();
    let shapeIdToLayer = new Map<string, L.Path>();

    let contextMenu = $state<{
        x: number;
        y: number;
        show: boolean;
        mapX?: number;
        mapY?: number;
        pinId?: string;
        // Custom actions for the context menu (used for overlapping choices)
        customActions?: { label: string; handler: () => void }[];
        // Flag to indicate this is a navigation/disambiguation menu (hides edit tools)
        isNavigation?: boolean;
    } | null>(null);

    // Fetch the map config on mount or when path changes
    // This replaces the derived store logic
    let mapConfig = $state<MapConfig | null>(null);

    async function loadMapData() {
        if (!data.path) return;
        try {
            const config = await loadMapConfig(data.path);
            if (config) {
                mapConfig = config;
            } else {
                error = "Failed to load map configuration.";
            }
        } catch (e) {
            console.error(e);
            error = "Error loading map.";
        }
    }

    // Effect to trigger load when the map path changes
    $effect(() => {
        if (data.path) {
            loadMapData();
        }
    });

    // Also subscribe to store updates to reflect changes (e.g. adding a pin)
    // This ensures that when registerMap calls loadedMaps.update, we see it here.
    $effect(() => {
        const cache = $loadedMaps.get(data.path);
        if (cache) {
            mapConfig = cache.config;
        }
    });

    onMount(() => {
        if (mapConfig) {
            updateMap(mapConfig);
        }
    });

    onDestroy(() => {
        if (map) {
            map.remove();
            map = null;
            imageOverlays.clear();
            markerLayerGroup = null;
            shapeLayerGroup = null;
            drawLayerGroup = null;
            multiTooltip = null;
            pinIdToLayer.clear();
            shapeIdToLayer.clear();
        }
    });

    // --- Layer Management Handlers ---

    async function handleLayerToggle(layerId: string, visible: boolean) {
        if (!data.path) return;
        try {
            // Optimistic update via store for instant feedback
            await updateMapConfig(data.path, (currentConfig) => ({
                ...currentConfig,
                layers: currentConfig.layers.map((l) =>
                    l.id === layerId ? { ...l, visible } : l,
                ),
            }));
        } catch (e) {
            console.error("Failed to toggle layer", e);
        }
    }

    async function handleLayerOpacity(layerId: string, opacity: number) {
        if (!data.path) return;
        try {
            await updateMapConfig(data.path, (currentConfig) => ({
                ...currentConfig,
                layers: currentConfig.layers.map((l) =>
                    l.id === layerId ? { ...l, opacity } : l,
                ),
            }));
        } catch (e) {
            console.error("Failed to change opacity", e);
        }
    }

    // --- Reactive Effects (Hover, Highlights, Styling) ---

    // Handle pin highlighting from console
    $effect(() => {
        // Subscribe to layerRevision to ensure we run after re-renders
        void layerRevision;

        if (highlightedPinId && pinIdToLayer.has(highlightedPinId)) {
            const marker = pinIdToLayer.get(highlightedPinId);
            const pinConfig = mapConfig?.pins?.find(
                (p) => p.id === highlightedPinId,
            );
            if (marker && pinConfig) {
                // Temporarily update icon to highlighted state
                const iconChar = pinConfig.icon || DEFAULT_PIN_ICON;
                const highlightedIcon = createEmojiIcon(
                    iconChar,
                    pinConfig.color || DEFAULT_ICON_COLOR,
                    true,
                    !!pinConfig.invisible, // Pass invisible state
                );

                marker.setIcon(highlightedIcon);
                marker.setZIndexOffset(1000); // Bring to front
                marker.openTooltip(); // Show tooltip on console hover
            }
        } else {
            // Reset all icons
            if (mapConfig?.pins) {
                mapConfig.pins.forEach((pin) => {
                    const marker = pinIdToLayer.get(pin.id);
                    if (marker) {
                        const iconChar = pin.icon || DEFAULT_PIN_ICON;
                        const normalIcon = createEmojiIcon(
                            iconChar,
                            pin.color || DEFAULT_ICON_COLOR,
                            false,
                            !!pin.invisible, // Pass invisible state
                        );
                        marker.setIcon(normalIcon);
                        marker.setZIndexOffset(0);

                        // Close tooltip only if not hovered by mouse
                        if (pin.id !== hoveredPinId) {
                            marker.closeTooltip();
                        }
                    }
                });
            }
        }
    });

    // Reactive Effect for Region Visibility & Styling
    // Logic: Invisible by default, Visible if Console Open, Highlighted if Hovered (Map or Console)
    $effect(() => {
        // Subscribe to layerRevision to ensure we run after re-renders
        void layerRevision;

        if (mapConfig?.shapes) {
            mapConfig.shapes.forEach((s) => {
                const layer = shapeIdToLayer.get(s.id);
                if (layer) {
                    const isTargeted =
                        s.id === highlightedRegionId ||
                        hoveredRegionIds.has(s.id);
                    const color = s.color || DEFAULT_SHAPE_COLOR;

                    if (isTargeted) {
                        // High Visibility (Hover State)
                        layer.setStyle({
                            stroke: true,
                            weight: 4,
                            color: color,
                            fillOpacity: 0.5,
                            dashArray: undefined, // Solid line for highlight
                        });
                        (layer as any).bringToFront();
                    } else if (isConsoleOpen) {
                        // Normal Visibility (Edit Mode)
                        layer.setStyle({
                            stroke: true,
                            weight: 2,
                            color: color,
                            fillOpacity: 0.2,
                            dashArray: undefined,
                        });
                    } else {
                        // Invisible (Default Mode)
                        // Note: fillOpacity must be 0 to be invisible, but we keep the layer interactive
                        layer.setStyle({
                            stroke: false,
                            fillOpacity: 0,
                        });
                    }
                }
            });
        }

        // Handle explicit console hover tooltip
        // We use multiTooltip manually here because we removed bindTooltip from regions to avoid duplication
        if (highlightedRegionId) {
            const layer = shapeIdToLayer.get(highlightedRegionId);
            const s = mapConfig?.shapes?.find(
                (s) => s.id === highlightedRegionId,
            );
            if (layer && s) {
                if (!multiTooltip) {
                    multiTooltip = L.tooltip({
                        direction: "top",
                        sticky: true,
                        opacity: 0.9,
                        className: "multi-region-tooltip",
                    });
                }
                // Force tooltip to center of region for console hover
                const center = (layer as any).getBounds().getCenter();
                multiTooltip
                    .setLatLng(center)
                    .setContent(s.label || "Region")
                    .addTo(map!);
            }
        } else if (hoveredRegionIds.size === 0 && !hoveredPinId) {
            // If not highlighting from console, AND not hovering map regions, AND not hovering pin
            // Cleanup tooltip. This cleans up when leaving the console item.
            if (multiTooltip) {
                multiTooltip.remove();
                multiTooltip = null;
            }
        }
    });

    // Reactive Effect to Hide Previews when Context Menu or Console is Open
    $effect(() => {
        if (contextMenu?.show || isConsoleOpen) {
            // Clear Link and Map Previews
            hoveredPath = null;
            hoveredElement = null;
            hoveredMapPath = null;
            hoveredMapElement = null;

            // Clear Multi-Region Tooltip
            // NOTE: We do NOT clear it here if isConsoleOpen is true and we are highlighting a region
            // But this effect runs when isConsoleOpen changes.
            // The styling effect above manages the tooltip for highlightedRegionId.
            // This block is mostly for cleaning up "stuck" previews when modes change.
            if (multiTooltip && !highlightedRegionId) {
                multiTooltip.remove();
                multiTooltip = null;
            }

            // Reset Pin Hover State if context menu opens
            if (contextMenu?.show) {
                hoveredPinId = null;
            }

            // Close native Leaflet tooltips if any are open
            // ONLY if context menu is open. If console is open, we allow tooltips.
            if (contextMenu?.show && map) {
                map.eachLayer((layer) => {
                    if (
                        layer instanceof L.Marker ||
                        layer instanceof L.Polygon ||
                        layer instanceof L.Circle
                    ) {
                        layer.closeTooltip();
                    }
                });
            }
        }
    });

    // Map Path Change
    $effect(() => {
        if (mapConfig && mapElement) {
            if (currentMapPath !== data.path) {
                if (map) {
                    map.remove();
                    map = null;
                    imageOverlays.clear();
                    markerLayerGroup = null;
                    shapeLayerGroup = null;
                    drawLayerGroup = null;
                    prevConfigStr = ""; // Reset config tracking
                    multiTooltip = null;
                    pinIdToLayer.clear();
                    shapeIdToLayer.clear();
                }
                currentMapPath = data.path;
            }
            updateMap(mapConfig);
        }
    });

    // --- Navigation Helpers ---
    function navigateToMap(mapTitle: string) {
        const lookup = get(mapPathLookup);
        const mapPath = lookup.get(mapTitle.toLowerCase());
        if (mapPath) {
            currentView.set({
                type: "map",
                data: { path: mapPath, title: mapTitle },
            });
        } else {
            console.warn(`Map not found: ${mapTitle}`);
            alert(`Linked map "${mapTitle}" not found.`);
        }
    }

    // Helper to navigate to a page
    function navigateToPage(pageTitle: string) {
        const lookup = get(pagePathLookup);
        const resolvedPath = lookup.get(pageTitle.toLowerCase());
        const finalPath = resolvedPath || pageTitle;
        currentView.set({
            type: "file",
            data: { path: finalPath, title: pageTitle },
        });
    }

    // --- Interaction Helper ---
    function attachClickBehavior(
        layer: L.Layer,
        item: { targetPage?: string; targetMap?: string },
    ) {
        layer.on("click", (e: L.LeafletMouseEvent) => {
            if (isDrawing) return; // Ignore interactions while drawing

            if (item.targetPage && item.targetMap) {
                contextMenu = {
                    x: e.originalEvent.clientX,
                    y: e.originalEvent.clientY,
                    show: true,
                    customActions: [
                        {
                            label: `Open Page: ${item.targetPage}`,
                            handler: () => navigateToPage(item.targetPage!),
                        },
                        {
                            label: `Open Map: ${item.targetMap}`,
                            handler: () => navigateToMap(item.targetMap!),
                        },
                    ],
                    isNavigation: true,
                };
            } else if (item.targetMap) {
                navigateToMap(item.targetMap);
            } else if (item.targetPage) {
                navigateToPage(item.targetPage);
            }
        });
    }

    function attachHoverBehavior(
        layer: L.Layer,
        item: { targetPage?: string; targetMap?: string },
    ) {
        layer.on("mouseover", (e: L.LeafletMouseEvent) => {
            if (isDrawing) return;
            // Prevent preview if context menu or console is open
            if (contextMenu?.show || isConsoleOpen) return;

            const targetLayer = e.target as any;
            const element = targetLayer.getElement
                ? targetLayer.getElement()
                : null;

            if (!element) return;

            // Handle Page Preview
            if (item.targetPage) {
                const lookup = get(pagePathLookup);
                // Try to find full path for the page title
                const path = lookup.get(item.targetPage.toLowerCase());

                // Only show preview if we found a valid file path
                if (path) {
                    hoveredPath = path;
                    hoveredElement = element;
                }
            }

            // Handle Map Preview
            if (item.targetMap) {
                const lookup = get(mapPathLookup);
                const path = lookup.get(item.targetMap.toLowerCase());
                if (path) {
                    hoveredMapPath = path;
                    hoveredMapElement = element;
                }
            }
        });

        layer.on("mouseout", () => {
            // Clear both
            hoveredPath = null;
            hoveredElement = null;
            hoveredMapPath = null;
            hoveredMapElement = null;
        });
    }

    function updateMap(config: MapConfig) {
        // 1. Prevent unnecessary re-renders (Fixes zoom flashing/resetting)
        const configStr = JSON.stringify(config);
        if (configStr === prevConfigStr && map) {
            return;
        }
        prevConfigStr = configStr;

        if (!mapElement) return;
        error = null;

        try {
            // Check if major structural changes occurred (Dimensions or Base Image).
            // If so, we must destroy and recreate the map to update bounds and base layer correctly.
            // This is simpler and faster than a full JSON hash.
            const baseLayer =
                config.layers.find((l) => l.id === "base") || config.layers[0];
            const currentBaseImage = baseLayer?.image || "";

            const hasStructuralChange =
                config.width !== prevStructure.w ||
                config.height !== prevStructure.h ||
                currentBaseImage !== prevStructure.baseImage;

            if (map && hasStructuralChange) {
                console.log(
                    "Map dimensions or base image changed, recreating map...",
                );
                map.remove();
                map = null;
                imageOverlays.clear(); // Reset tracked layers
                markerLayerGroup = null;
                shapeLayerGroup = null;
                drawLayerGroup = null;
                if (multiTooltip) {
                    multiTooltip.remove();
                    multiTooltip = null;
                }
            }

            // Update tracking state
            prevStructure = {
                w: config.width,
                h: config.height,
                baseImage: currentBaseImage,
            };

            const w = config.width;
            const h = config.height;
            // Define bounds: Top-Left [0,0] to Bottom-Right [height, width]
            // We pad the bounds slightly so the user can drag a bit past the edge
            // In CRS.Simple, [0,0] is bottom-left. We map our top-left to [h, 0]
            const bounds: L.LatLngBoundsExpression = [
                [0, 0],
                [h, w],
            ];

            if (!map) {
                map = L.map(mapElement, {
                    crs: L.CRS.Simple,
                    minZoom: -5, // Temporary low min zoom to allow fitting logic to work
                    maxZoom: 3,
                    zoomControl: false,
                    // Allow fractional zoom levels for perfect fitting (fills screen exactly)
                    zoomSnap: 0,
                    // Restrict panning to the image area exactly (no padding)
                    maxBounds: bounds,
                    maxBoundsViscosity: 0.8, // Allow some rubber-banding
                });

                // Remove Leaflet prefix for a cleaner UI
                map.attributionControl.setPrefix("");

                L.control.zoom({ position: "topright" }).addTo(map);

                // Initialize Groups
                markerLayerGroup = L.layerGroup().addTo(map);
                shapeLayerGroup = L.layerGroup().addTo(map);
                drawLayerGroup = L.layerGroup().addTo(map);

                // Calculate the optimal zoom to fit the image exactly in the container
                // This ensures the map always fills the screen on load
                const fitZoom = map.getBoundsZoom(bounds);

                // Set the initial view to the calculated fit zoom level
                map.setView([h / 2, w / 2], fitZoom, { animate: false });

                // Set this fitZoom as the absolute minimum zoom level allowed
                // This prevents the user from zooming out further than the image boundaries
                map.setMinZoom(fitZoom);

                // --- Global Event Listeners for Overlap Handling ---

                map.on("contextmenu", (e: L.LeafletMouseEvent) => {
                    if (isDrawing) return; // Don't show context menu while drawing
                    if (!mapConfig) return;

                    const mapX = e.latlng.lng;
                    const mapY = h - e.latlng.lat; // Convert Leaflet LatLng to Map Coords (Y-flip)

                    // Find all shapes under cursor
                    // Only consider shapes that are visible (layer check)
                    const shapesAtCursor = getShapesAtPoint(
                        mapX,
                        mapY,
                        mapConfig.shapes,
                    ).filter((s) => {
                        if (!s.layerId) return true;
                        const layer = mapConfig!.layers.find(
                            (l) => l.id === s.layerId,
                        );
                        return layer ? layer.visible : true;
                    });

                    // Create edit actions for each shape found
                    const editActions = shapesAtCursor.map((shape) => ({
                        label: `Edit Region: ${shape.label || "Unnamed"}`,
                        handler: () => handleEditRegion(shape),
                    }));

                    // Create delete actions for each shape found
                    const deleteActions = shapesAtCursor.map((shape) => ({
                        label: `Delete Region: ${shape.label || "Unnamed"}`,
                        handler: () => handleDeleteShape(shape.id),
                    }));

                    contextMenu = {
                        x: e.originalEvent.clientX,
                        y: e.originalEvent.clientY,
                        show: true,
                        mapX,
                        mapY,
                        // If we have overlapping shapes, populate custom actions to allow the user to choose which to delete
                        customActions: [
                            ...(editActions.length > 0 ||
                            deleteActions.length > 0
                                ? [{ isSeparator: true } as any]
                                : []),
                            ...(editActions.length > 0 ? editActions : []),
                            ...(deleteActions.length > 0 ? deleteActions : []),
                        ],
                    };
                });

                // Handle Hover for Overlapping Regions (Multi-Tooltip + Highlight Sync)
                map.on("mousemove", (e: L.LeafletMouseEvent) => {
                    if (isDrawing) return;
                    // Prevent showing tooltip if context menu is open
                    // We ALLOW it if console is open now, but we will block full previews below
                    if (contextMenu?.show) return;
                    if (!mapConfig) return;

                    // 1. PIN PRIORITY: If hovering a pin, hide region tooltips and return
                    if (hoveredPinId) {
                        if (multiTooltip) {
                            multiTooltip.remove();
                            multiTooltip = null;
                        }
                        // Clear highlight when moving from region to pin
                        hoveredRegionIds = new Set();
                        return;
                    }

                    const mapX = e.latlng.lng;
                    const mapY = h - e.latlng.lat;

                    // Filter hidden shapes
                    const shapes = getShapesAtPoint(
                        mapX,
                        mapY,
                        mapConfig.shapes,
                    ).filter((s) => {
                        if (!s.layerId) return true;
                        const layer = mapConfig!.layers.find(
                            (l) => l.id === s.layerId,
                        );
                        return layer ? layer.visible : true;
                    });

                    // 2. SYNC HOVER HIGHLIGHT STATE
                    // Optimization: Only update state if the set of IDs has actually changed.
                    // This prevents hammering the reactivity system on every pixel of mouse movement.
                    const foundIds = new Set(shapes.map((s) => s.id));

                    let changed = foundIds.size !== hoveredRegionIds.size;
                    if (!changed) {
                        for (const id of foundIds) {
                            if (!hoveredRegionIds.has(id)) {
                                changed = true;
                                break;
                            }
                        }
                    }

                    if (changed) {
                        hoveredRegionIds = foundIds;
                    }

                    // 3. TOOLTIP LOGIC
                    if (shapes.length > 0) {
                        let content = "";

                        // Condition 1: Single Region
                        if (shapes.length === 1) {
                            const s = shapes[0];
                            content = s.label || "Region";

                            // --- HANDLE PREVIEWS FOR SINGLE REGION ---
                            // Only show full link previews if Console is CLOSED
                            if (!isConsoleOpen) {
                                let foundPreview = false;

                                // Page Preview
                                if (s.targetPage) {
                                    const lookup = get(pagePathLookup);
                                    const path = lookup.get(
                                        s.targetPage.toLowerCase(),
                                    );
                                    if (path) {
                                        hoveredPath = path;
                                        const layer = shapeIdToLayer.get(s.id);
                                        if (
                                            layer &&
                                            (layer as any).getElement
                                        ) {
                                            hoveredElement = (
                                                layer as any
                                            ).getElement();
                                            foundPreview = true;
                                        }
                                    }
                                }
                                // Map Preview
                                if (s.targetMap) {
                                    const lookup = get(mapPathLookup);
                                    const path = lookup.get(
                                        s.targetMap.toLowerCase(),
                                    );
                                    if (path) {
                                        hoveredMapPath = path;
                                        const layer = shapeIdToLayer.get(s.id);
                                        if (
                                            layer &&
                                            (layer as any).getElement
                                        ) {
                                            hoveredMapElement = (
                                                layer as any
                                            ).getElement();
                                            foundPreview = true;
                                        }
                                    }
                                }

                                if (!foundPreview) {
                                    hoveredPath = null;
                                    hoveredElement = null;
                                    hoveredMapPath = null;
                                    hoveredMapElement = null;
                                }
                            }
                        }
                        // Condition 2: Overlapping Regions
                        else {
                            // Show Bullet List
                            const listItems = shapes
                                .map(
                                    (s) =>
                                        `<li>${s.label || "Unnamed Region"}</li>`,
                                )
                                .join("");
                            content = `<ul style="margin: 0; padding-left: 1.2rem; list-style-type: disc;">${listItems}</ul>`;

                            // --- HIDE PREVIEWS ON OVERLAP ---
                            hoveredPath = null;
                            hoveredElement = null;
                            hoveredMapPath = null;
                            hoveredMapElement = null;
                        }

                        if (!multiTooltip) {
                            multiTooltip = L.tooltip({
                                direction: "top",
                                sticky: true,
                                opacity: 0.9,
                                className: "multi-region-tooltip",
                            });
                        }

                        multiTooltip
                            .setLatLng(e.latlng)
                            .setContent(content)
                            .addTo(map!);
                    } else {
                        // No shapes under cursor
                        if (multiTooltip) {
                            multiTooltip.remove();
                            multiTooltip = null;
                        }
                        // Clear previews
                        hoveredPath = null;
                        hoveredElement = null;
                        hoveredMapPath = null;
                        hoveredMapElement = null;
                    }
                });

                // Clear highlights when leaving the map area
                map.on("mouseout", () => {
                    hoveredRegionIds = new Set();
                });

                map.on("click movestart zoomstart", () => {
                    // While drawing, clicks are handled by separate listener
                    if (!isDrawing) contextMenu = null;
                });

                // --- Drawing Interactions ---
                map.on("click", (e: L.LeafletMouseEvent) => {
                    if (!isDrawing) {
                        if (!mapConfig) return;

                        // Handle Click Disambiguation for Overlapping Regions
                        // Note: This only runs if the click wasn't stopped by a Pin
                        const mapX = e.latlng.lng;
                        const mapY = h - e.latlng.lat;

                        // Find shapes with navigation targets
                        // Filter hidden shapes
                        const shapes = getShapesAtPoint(
                            mapX,
                            mapY,
                            mapConfig.shapes,
                        )
                            .filter((s) => {
                                if (!s.layerId) return true;
                                const layer = mapConfig!.layers.find(
                                    (l) => l.id === s.layerId,
                                );
                                return layer ? layer.visible : true;
                            })
                            .filter((s) => s.targetPage || s.targetMap);

                        if (shapes.length === 0) return;

                        // If only one target, navigate directly
                        if (shapes.length === 1) {
                            const target = shapes[0];
                            if (target.targetPage && target.targetMap) {
                                // Double-linked single region: Ask user (rare but possible)
                                contextMenu = {
                                    x: e.originalEvent.clientX,
                                    y: e.originalEvent.clientY,
                                    show: true,
                                    customActions: [
                                        {
                                            label: `Open Page: ${target.targetPage}`,
                                            handler: () =>
                                                navigateToPage(
                                                    target.targetPage!,
                                                ),
                                        },
                                        {
                                            label: `Open Map: ${target.targetMap}`,
                                            handler: () =>
                                                navigateToMap(
                                                    target.targetMap!,
                                                ),
                                        },
                                    ],
                                    isNavigation: true,
                                };
                            } else if (target.targetMap) {
                                navigateToMap(target.targetMap);
                            } else if (target.targetPage) {
                                navigateToPage(target.targetPage);
                            }
                            return;
                        }

                        // If multiple targets (Overlap): Show Disambiguation Menu
                        if (shapes.length > 1) {
                            const actions = shapes.flatMap((s) => {
                                const acts = [];
                                if (s.targetPage) {
                                    acts.push({
                                        label: `Go to Page: ${s.targetPage} (${s.label || "Region"})`,
                                        handler: () =>
                                            navigateToPage(s.targetPage!),
                                    });
                                }
                                if (s.targetMap) {
                                    acts.push({
                                        label: `Go to Map: ${s.targetMap} (${s.label || "Region"})`,
                                        handler: () =>
                                            navigateToMap(s.targetMap!),
                                    });
                                }
                                return acts;
                            });

                            contextMenu = {
                                x: e.originalEvent.clientX,
                                y: e.originalEvent.clientY,
                                show: true,
                                customActions: actions,
                                isNavigation: true,
                            };
                            return;
                        }
                    }

                    if (drawMode === "polygon") {
                        tempPoints.push(e.latlng);

                        if (!tempLayer) {
                            // First point: Create the layer with interactive: false
                            // This ensures click/dblclick events pass through to the map
                            tempLayer = L.polyline(tempPoints, {
                                color: DRAWING_COLOR,
                                dashArray: "5, 5",
                                interactive: false, // Critical for robust double-click
                            }).addTo(drawLayerGroup!);
                        } else {
                            // Subsequent points: Update existing layer
                            (tempLayer as L.Polyline).setLatLngs(tempPoints);
                        }
                    }
                });

                // Finisher for polygon (double click)
                map.on("dblclick", (_e: L.LeafletMouseEvent) => {
                    if (isDrawing && drawMode === "polygon") {
                        // Pass the LATEST config (mapConfig), not the stale 'config' from closure
                        // Since mapConfig is reactive, we can just access it here (it's in the component scope)
                        finishDrawing();
                    }
                });
            }

            // --- SYNC IMAGE LAYERS (Updates Dynamic State) ---
            const currentLayerIds = new Set<string>();

            // Sort layers by zIndex ascending for Leaflet (higher zIndex renders on top)
            // Note: MapConfig stores zIndex as "higher number = top"
            config.layers.forEach((layer) => {
                currentLayerIds.add(layer.id);

                // If layer is hidden, remove the overlay if it exists
                if (!layer.visible) {
                    if (imageOverlays.has(layer.id)) {
                        imageOverlays.get(layer.id)!.remove();
                        imageOverlays.delete(layer.id);
                    }
                    return;
                }

                const imagePath = $imagePathLookup.get(
                    layer.image.toLowerCase(),
                );
                if (!imagePath) return;

                const assetUrl = convertFileSrc(imagePath);
                let overlay = imageOverlays.get(layer.id);

                if (overlay) {
                    // Update existing overlay properties
                    overlay.setOpacity(layer.opacity);
                    overlay.setZIndex(layer.zIndex);
                    // Leaflet ImageOverlay doesn't strictly support src changes easily
                    // But if the URL somehow changed (rare for this use case), we could handle it here
                } else {
                    // Create new overlay
                    overlay = L.imageOverlay(assetUrl, bounds, {
                        opacity: layer.opacity,
                        zIndex: layer.zIndex,
                    }).addTo(map!);
                    imageOverlays.set(layer.id, overlay);
                }
            });

            // Cleanup: Remove overlays that are no longer in the config (e.g., deleted layers)
            for (const [id, overlay] of imageOverlays) {
                if (!currentLayerIds.has(id)) {
                    overlay.remove();
                    imageOverlays.delete(id);
                }
            }

            // --- Update Pins ---
            if (markerLayerGroup) {
                markerLayerGroup.clearLayers();
                pinIdToLayer.clear();
            }
            if (config.pins && markerLayerGroup) {
                config.pins.forEach(
                    (
                        pin: MapPin & {
                            icon?: string;
                            color?: string;
                            invisible?: boolean;
                        },
                    ) => {
                        // CHECK LAYER VISIBILITY
                        if (pin.layerId) {
                            const layer = config.layers.find(
                                (l) => l.id === pin.layerId,
                            );
                            if (layer && !layer.visible) {
                                return; // Skip rendering this pin
                            }
                        }

                        const leafletLat = h - pin.y;
                        const leafletLng = pin.x;

                        // Default to standard pin if none selected
                        const iconChar = pin.icon || DEFAULT_PIN_ICON;

                        const iconToUse = createEmojiIcon(
                            iconChar,
                            pin.color || DEFAULT_ICON_COLOR,
                            false,
                            !!pin.invisible, // Pass invisible state
                        );

                        const marker = L.marker([leafletLat, leafletLng], {
                            icon: iconToUse,
                            // Use Leaflet's native property to stop map events
                            // This replaces e.originalEvent.stopPropagation() usage
                            bubblingMouseEvents: false,
                        });

                        let tooltipText = pin.label || "Pin";
                        if (!pin.label) {
                            if (pin.targetPage) tooltipText = pin.targetPage;
                            else if (pin.targetMap) tooltipText = pin.targetMap;
                        }

                        // Apply the same styling class to pins as regions for consistency
                        marker.bindTooltip(tooltipText, {
                            direction: "top",
                            offset: [0, -40],
                            className: "multi-region-tooltip",
                        });

                        // Set listeners for Pin Priority
                        marker.on("mouseover", () => {
                            if (contextMenu?.show) return; // Only guard Context Menu
                            hoveredPinId = pin.id;
                        });
                        marker.on("mouseout", () => {
                            hoveredPinId = null;
                        });

                        attachClickBehavior(marker, pin);
                        attachHoverBehavior(marker, pin);

                        marker.on("contextmenu", (e: L.LeafletMouseEvent) => {
                            contextMenu = {
                                x: e.originalEvent.clientX,
                                y: e.originalEvent.clientY,
                                show: true,
                                pinId: pin.id,
                            };
                        });

                        marker.addTo(markerLayerGroup!);
                        pinIdToLayer.set(pin.id, marker);
                    },
                );
            }

            // --- Update Regions (Shapes) ---
            if (shapeLayerGroup) {
                shapeLayerGroup.clearLayers();
                shapeIdToLayer.clear();
            }
            if (config.shapes && shapeLayerGroup) {
                config.shapes.forEach((shape: MapRegion) => {
                    // CHECK LAYER VISIBILITY
                    if (shape.layerId) {
                        const layer = config.layers.find(
                            (l) => l.id === shape.layerId,
                        );
                        if (layer && !layer.visible) {
                            return; // Skip rendering
                        }
                    }

                    let layer: L.Path;
                    const color = shape.color || DEFAULT_SHAPE_COLOR;

                    // Initial style setup - invisible by default
                    // Note: We create them invisibly, allowing the reactive effect
                    // or map interaction logic to reveal them.
                    const initialStyle = {
                        color: color,
                        fillColor: color,
                        fillOpacity: 0,
                        weight: 0,
                        stroke: false,
                    };

                    if (shape.type === "polygon") {
                        // Leaflet Polygon: Array of [Lat, Lng]
                        // We must map each point: [h - p.y, p.x]
                        const latLngs = shape.points.map(
                            (p) => [h - p.y, p.x] as [number, number],
                        );
                        layer = L.polygon(latLngs, initialStyle);
                    } else {
                        return;
                    }

                    layer.addTo(shapeLayerGroup!);
                    shapeIdToLayer.set(shape.id, layer);
                });
            }

            // Increment revision to signal styling effects that layers are rebuilt
            layerRevision += 1;
        } catch (e: any) {
            console.error("Map Error:", e);
            error = `Map Error: ${e.message}`;
        }
    }

    // --- Drawing Handlers ---

    function startDrawing(mode: "polygon") {
        isDrawing = true;
        drawMode = mode;
        // Automatically close the console to provide full view of the map for drawing
        isConsoleOpen = false;

        tempPoints = [];
        if (drawLayerGroup) drawLayerGroup.clearLayers();
        tempLayer = null; // Explicitly reset the tempLayer reference
        if (map) map.doubleClickZoom.disable(); // Prevent zoom on dblclick finish
        contextMenu = null; // Close menu
    }

    function finishDrawing() {
        // Use get(loadedMaps) to ensure we have the absolute latest version of the config from the store
        // This fixes the issue where using a potentially stale `mapConfig` (derived)
        // might overwrite recent changes (like adding a pin) if the reactivity hasn't propagated yet.
        const currentCache = get(loadedMaps).get(data.path);
        const currentConfig = currentCache?.config;

        if (!currentConfig) {
            console.error("Cannot finish drawing: Map config not found.");
            return;
        }

        const h = currentConfig.height || 2048;
        let shapeData: any;

        if (drawMode === "polygon" && tempPoints.length >= 3) {
            // Convert LatLngs back to map coordinates (Y flip)
            const points = tempPoints.map((p) => ({
                x: Math.round(p.lng),
                y: Math.round(h - p.lat),
            }));
            shapeData = { type: "polygon", points };
        }

        // Cleanup drawing state
        isDrawing = false;
        drawMode = null;
        if (drawLayerGroup) drawLayerGroup.clearLayers();
        if (map) map.doubleClickZoom.enable();

        if (shapeData) {
            openModal({
                component: MapObjectModal,
                props: {
                    onClose: closeModal,
                    mapPath: data.path,
                    mapConfig: currentConfig, // Pass the fresh config
                    mode: "region",
                    initialData: { shapeData },
                },
            });
        }
    }

    function handleAddPin() {
        if (
            !contextMenu ||
            !mapConfig ||
            contextMenu.mapX === undefined ||
            contextMenu.mapY === undefined
        )
            return;
        const { mapX, mapY } = contextMenu;
        contextMenu = null;
        openModal({
            component: MapObjectModal,
            props: {
                onClose: closeModal,
                mapPath: data.path,
                mapConfig: mapConfig,
                mode: "pin",
                initialData: { x: mapX, y: mapY },
            },
        });
    }

    function handleEditPin(pinId: string) {
        const pin = mapConfig?.pins?.find((p) => p.id === pinId);
        if (!pin || !mapConfig) return;

        contextMenu = null;
        openModal({
            component: MapObjectModal,
            props: {
                onClose: closeModal,
                mapPath: data.path,
                mapConfig: mapConfig,
                mode: "pin",
                initialData: pin,
            },
        });
    }

    function handleEditRegion(region: MapRegion) {
        if (!mapConfig) return;

        contextMenu = null;
        openModal({
            component: MapObjectModal,
            props: {
                onClose: closeModal,
                mapPath: data.path,
                mapConfig: mapConfig,
                mode: "region",
                initialData: region,
            },
        });
    }

    function handleDeletePin(pinId: string) {
        contextMenu = null;
        openModal({
            component: ConfirmModal,
            props: {
                title: "Delete Pin",
                message: "Are you sure you want to delete this pin?",
                onClose: closeModal,
                onConfirm: async () => {
                    try {
                        await updateMapConfig(data.path, (currentConfig) => ({
                            ...currentConfig,
                            pins: (currentConfig.pins || []).filter(
                                (p) => p.id !== pinId,
                            ),
                        }));
                        closeModal();
                    } catch (e) {
                        alert("Failed to delete pin.");
                    }
                },
            },
        });
    }

    function handleDeleteShape(shapeId: string) {
        contextMenu = null;
        openModal({
            component: ConfirmModal,
            props: {
                title: "Delete Region",
                message: "Are you sure you want to delete this region?",
                onClose: closeModal,
                onConfirm: async () => {
                    try {
                        await updateMapConfig(data.path, (currentConfig) => ({
                            ...currentConfig,
                            shapes: (currentConfig.shapes || []).filter(
                                (s) => s.id !== shapeId,
                            ),
                        }));
                        closeModal();
                    } catch (e) {
                        alert("Failed to delete region.");
                    }
                },
            },
        });
    }
</script>

<LinkPreview anchorEl={hoveredElement} targetPath={hoveredPath} />
<MapPreview anchorEl={hoveredMapElement} targetPath={hoveredMapPath} />

<div class="map-view-container">
    <ViewHeader>
        <div slot="left">
            <h2 class="view-title">{data?.title.replace(".cmap", "")}</h2>
        </div>
        <div slot="right">
            <!-- Draw Controls -->
            {#if isDrawing}
                <div class="draw-controls">
                    <!-- Instruction text moved to map overlay -->
                    <Button
                        size="small"
                        onclick={() => {
                            isDrawing = false;
                            drawLayerGroup?.clearLayers();
                            map?.doubleClickZoom.enable();
                        }}>Cancel Drawing</Button
                    >
                </div>
            {:else}
                <!-- Map Console Toggle (Hidden while drawing) -->
                <Button
                    size="small"
                    onclick={() => (isConsoleOpen = !isConsoleOpen)}
                >
                    {isConsoleOpen ? "Close Console" : "Manage Map"}
                </Button>
            {/if}
        </div>
    </ViewHeader>

    {#if !$hasMapsEntitlement}
        <div class="status-container">
            <p>Maps are not unlocked. Please upgrade your license.</p>
        </div>
    {:else if error}
        <div class="error-container">
            <ErrorBox title="Map Error">{error}</ErrorBox>
        </div>
    {:else if !mapConfig}
        <div class="status-container"><p>Loading Map Configuration...</p></div>
    {:else}
        <!--
            Added 'show-ghosts' class conditional on isConsoleOpen
            to reveal invisible pins.
        -->
        <div
            class="map-wrapper"
            class:drawing={isDrawing}
            class:show-ghosts={isConsoleOpen}
        >
            <div bind:this={mapElement} class="leaflet-container"></div>

            {#if isDrawing}
                <div class="map-drawing-hint">
                    {drawMode === "polygon"
                        ? "Click map to add points. Double-click to finish."
                        : "Draw mode active"}
                </div>
            {/if}

            {#if !isDrawing && mapConfig.layers.length > 0}
                <MapLayerControl
                    layers={mapConfig.layers}
                    onToggle={handleLayerToggle}
                    onOpacityChange={handleLayerOpacity}
                />
            {/if}

            {#if isConsoleOpen}
                <MapConsole
                    {mapConfig}
                    mapPath={data.path}
                    onClose={() => (isConsoleOpen = false)}
                    onHoverPin={(id) => (highlightedPinId = id)}
                    onHoverRegion={(id) => (highlightedRegionId = id)}
                    activePinId={hoveredPinId || highlightedPinId}
                    activeRegionIds={new Set([
                        ...hoveredRegionIds,
                        ...(highlightedRegionId ? [highlightedRegionId] : []),
                    ])}
                />
            {/if}
        </div>
    {/if}

    {#if contextMenu && contextMenu.show}
        <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => (contextMenu = null)}
            actions={[
                ...(!contextMenu.isNavigation
                    ? [
                          // 3. Pin Actions (Edit/Delete) - only if clicked on a pin
                          ...(contextMenu.pinId
                              ? [
                                    {
                                        label: "Edit Pin",
                                        handler: () =>
                                            contextMenu?.pinId &&
                                            handleEditPin(contextMenu.pinId),
                                    },
                                    {
                                        label: "Delete Pin",
                                        handler: () =>
                                            contextMenu?.pinId &&
                                            handleDeletePin(contextMenu.pinId),
                                    },
                                    // No separator needed here
                                ]
                              : [
                                    // 2. Creation Actions (always available for editing context)
                                    {
                                        label: "Add Pin Here...",
                                        handler: handleAddPin,
                                    },
                                    { isSeparator: true as const },
                                    {
                                        label: "Draw Polygon Region",
                                        handler: () => startDrawing("polygon"),
                                    },
                                ]),
                      ]
                    : []),
                // 3. Custom actions (e.g. Delete specific overlapping region, OR Navigate Disambiguation)
                ...(contextMenu.customActions || []),
            ]}
        />
    {/if}
</div>

<style>
    .map-view-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
    }
    .view-title {
        font-family: var(--font-family-heading);
        color: var(--color-text-heading);
        margin: 0;
        font-size: 1.5rem;
    }
    .draw-controls {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .error-container,
    .status-container {
        padding: 2rem;
        display: flex;
        justify-content: center;
        align-items: center;
        color: var(--color-text-secondary);
        font-style: italic;
    }
    .map-wrapper {
        flex-grow: 1;
        position: relative;
        background-color: #222;
        overflow: hidden;
    }
    /* Cursor styling for drawing mode */
    .map-wrapper.drawing .leaflet-container {
        cursor: crosshair !important;
    }
    .leaflet-container {
        width: 100%;
        height: 100%;
        background: transparent;
    }

    /* Floating Hint Overlay */
    .map-drawing-hint {
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(0, 0, 0, 0.75);
        color: white;
        padding: 0.5rem 1.2rem;
        border-radius: 999px;
        pointer-events: none;
        z-index: 2000; /* Above everything including markers/popups */
        font-size: 0.9rem;
        backdrop-filter: blur(4px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        font-weight: 500;
        white-space: nowrap;
    }

    /* Optimized marker style: drop-shadow moved here for better performance */
    :global(.custom-pin-marker) {
        background: transparent;
        border: none;
        filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3));
        will-change: transform; /* Hint to browser to optimize layering */
        transition:
            transform 0.2s,
            z-index 0.2s;
    }

    :global(.custom-pin-marker.highlighted) {
        z-index: 1000 !important;
        filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
    }

    /* GHOST PIN STYLES
       Default: Opacity 0 (Invisible but clickable)
       Console Open: Opacity 0.6 (Visible "Ghost")
    */
    :global(.ghost-pin-marker) {
        background: transparent;
        border: none;
        opacity: 0; /* Totally invisible by default */
        transition:
            opacity 0.3s ease,
            transform 0.2s;
        /* Ensure it captures clicks even when invisible,
           though often 'opacity: 0' elements do catch events by default. */
        pointer-events: auto;
    }
    /* When .show-ghosts is present on the wrapper (toggled by isConsoleOpen),
       increase the opacity so the user can see them to edit/delete.
    */
    .map-wrapper.show-ghosts :global(.ghost-pin-marker) {
        opacity: 0.6;
    }

    :global(.ghost-pin-marker.highlighted) {
        /* When hovering from console, ensure it's fully visible */
        opacity: 1 !important;
        z-index: 1000 !important;
    }

    /* Styling for the multi-region tooltip */
    :global(.multi-region-tooltip) {
        background-color: rgba(0, 0, 0, 0.85);
        border: 1px solid #444;
        color: #eee;
        font-size: 0.9rem;
        padding: 0.5rem;
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
    }
    /* Hide the little triangle tip if desired, or style it */
    :global(.multi-region-tooltip.leaflet-tooltip-top:before) {
        border-top-color: rgba(0, 0, 0, 0.85);
    }

    /* Theme overrides for Leaflet controls */
    :global(.leaflet-bar) {
        border: 2px solid var(--color-border-primary) !important;
        border-radius: 4px !important;
        box-shadow: 0 1px 5px rgba(0, 0, 0, 0.4) !important;
    }
    :global(.leaflet-bar a) {
        background-color: var(--color-background-secondary) !important;
        color: var(--color-text-primary) !important;
        border-bottom: 1px solid var(--color-border-primary) !important;
    }
    :global(.leaflet-bar a:hover) {
        background-color: var(--color-background-tertiary) !important;
        color: var(--color-text-primary) !important;
    }
    :global(.leaflet-bar a:last-child) {
        border-bottom: none !important;
    }
    :global(.leaflet-control-zoom-in),
    :global(.leaflet-control-zoom-out) {
        font-family: var(--font-family-body) !important;
        font-weight: bold !important;
    }
</style>
