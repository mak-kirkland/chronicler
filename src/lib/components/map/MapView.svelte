<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { get } from "svelte/store";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import { navigateToPageByTitle, navigateToMapByTitle } from "$lib/actions";
    import { loadedMaps, loadMapConfig, updateMapConfig } from "$lib/mapStore";
    import {
        addPin,
        editPin,
        deletePin,
        editRegion,
        addRegion,
        deleteShape,
    } from "$lib/mapActions";
    import {
        getShapesAtPoint,
        createEmojiIcon,
        isLayerVisible,
        setsEqual,
        REGION_STYLES,
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
    import type {
        MapConfig,
        MapLayer,
        MapPin,
        MapRegion,
    } from "$lib/mapModels";
    import type { PageHeader } from "$lib/bindings";
    import ErrorBox from "$lib/components/ui/ErrorBox.svelte";
    import ViewHeader from "$lib/components/views/ViewHeader.svelte";
    import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
    import LinkPreview from "$lib/components/ui/LinkPreview.svelte";
    import MapPreview from "$lib/components/map/MapPreview.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import MapConsole from "$lib/components/map/MapConsole.svelte";
    import MapLayerControl from "$lib/components/map/MapLayerControl.svelte";
    import { hasMapsEntitlement } from "$lib/licenseStore";

    let { data } = $props<{ data: PageHeader }>();

    // --- Core Leaflet State ---

    let mapElement = $state<HTMLElement | null>(null);
    let map: L.Map | null = null;

    // Layer Groups to manage different types of content
    let imageOverlays = new Map<string, L.ImageOverlay>(); // Track image layers by ID
    let markerLayerGroup: L.LayerGroup | null = null;
    let shapeLayerGroup: L.LayerGroup | null = null;
    // Temp layer for drawing in progress
    let drawLayerGroup: L.LayerGroup | null = null;

    // --- Map Data ---

    let error = $state<string | null>(null);
    // Fetch the map config on mount or when path changes
    // This replaces the derived store logic
    let mapConfig = $state<MapConfig | null>(null);
    let currentMapPath: string | null = null;
    // Track previous config reference to skip no-op updates.
    // Since updateMapConfig/registerMap always produce new objects,
    // reference equality is sufficient and avoids O(n) JSON serialization.
    let prevConfig: MapConfig | null = null;

    // Track state to know when to fully re-init map.
    // We only need to check these 3 properties — much faster than JSON hashing.
    let prevStructure = { w: 0, h: 0, baseImage: "" };

    // --- Drawing State ---

    let isDrawing = $state(false);
    let drawMode = $state<"polygon" | null>(null);
    let tempPoints: L.LatLng[] = [];
    let tempLayer: L.Layer | null = null; // Visual feedback during draw

    // --- Console & Interaction State ---

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

    // --- Preview State ---

    // Link Preview State
    let hoveredElement = $state<HTMLElement | null>(null);
    let hoveredPath = $state<string | null>(null);
    // Map Preview State
    let hoveredMapElement = $state<HTMLElement | null>(null);
    let hoveredMapPath = $state<string | null>(null);

    // --- Tooltip & Lookup State ---

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

    // --- Derived Console State ---

    // Merged set of active region IDs for the console, combining map hover and console hover.
    let activeRegionIds = $derived(
        highlightedRegionId
            ? new Set([...hoveredRegionIds, highlightedRegionId])
            : hoveredRegionIds,
    );

    // =========================================================================
    // DATA LOADING
    // =========================================================================

    // Single effect: load from disk on path change, then stay in sync via store.
    $effect(() => {
        if (!data.path) return;

        // Kick off initial load (populates the store cache)
        loadMapConfig(data.path)
            .then((config) => {
                if (config) {
                    mapConfig = config;
                } else {
                    error = "Failed to load map configuration.";
                }
            })
            .catch((e) => {
                console.error(e);
                error = "Error loading map.";
            });
    });

    // Subscribe to store updates to reflect changes (e.g. adding a pin).
    // This also picks up the initial load result once cached.
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
        destroyMap();
    });

    // =========================================================================
    // NAVIGATION HELPERS
    // =========================================================================

    /**
     * Navigate to an item's target. If it has both a page and map target,
     * show a disambiguation context menu.
     */
    function navigateToTarget(
        item: { targetPage?: string; targetMap?: string },
        clientX: number,
        clientY: number,
    ) {
        if (item.targetPage && item.targetMap) {
            contextMenu = {
                x: clientX,
                y: clientY,
                show: true,
                customActions: [
                    {
                        label: `Open Page: ${item.targetPage}`,
                        handler: () => navigateToPageByTitle(item.targetPage!),
                    },
                    {
                        label: `Open Map: ${item.targetMap}`,
                        handler: () => navigateToMapByTitle(item.targetMap!),
                    },
                ],
                isNavigation: true,
            };
        } else if (item.targetMap) {
            navigateToMapByTitle(item.targetMap);
        } else if (item.targetPage) {
            navigateToPageByTitle(item.targetPage);
        }
    }

    // =========================================================================
    // LEAFLET INTERACTION BEHAVIOR (attached to markers/shapes)
    // =========================================================================

    function attachClickBehavior(
        layer: L.Layer,
        item: { targetPage?: string; targetMap?: string },
    ) {
        layer.on("click", (e: L.LeafletMouseEvent) => {
            if (isDrawing) return; // Ignore interactions while drawing
            navigateToTarget(
                item,
                e.originalEvent.clientX,
                e.originalEvent.clientY,
            );
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

            const { pagePath, mapTargetPath } = resolveTargetPaths(item);

            if (pagePath) {
                hoveredPath = pagePath;
                hoveredElement = element;
            }
            if (mapTargetPath) {
                hoveredMapPath = mapTargetPath;
                hoveredMapElement = element;
            }
        });

        layer.on("mouseout", () => {
            // Clear both
            clearAllPreviews();
        });
    }

    // =========================================================================
    // PREVIEW / TOOLTIP MANAGEMENT
    // =========================================================================

    /**
     * Resolves a map object's targetPage/targetMap titles to full file paths
     * using the world store lookups. Returns null for unresolved targets.
     */
    function resolveTargetPaths(item: {
        targetPage?: string;
        targetMap?: string;
    }) {
        const pagePath = item.targetPage
            ? (get(pagePathLookup).get(item.targetPage.toLowerCase()) ?? null)
            : null;
        const mapTargetPath = item.targetMap
            ? (get(mapPathLookup).get(item.targetMap.toLowerCase()) ?? null)
            : null;
        return { pagePath, mapTargetPath };
    }

    function clearAllPreviews() {
        hoveredPath = null;
        hoveredElement = null;
        hoveredMapPath = null;
        hoveredMapElement = null;
    }

    function removeMultiTooltip() {
        if (multiTooltip) {
            multiTooltip.remove();
            multiTooltip = null;
        }
    }

    function getOrCreateMultiTooltip(): L.Tooltip {
        if (!multiTooltip) {
            multiTooltip = L.tooltip({
                direction: "top",
                sticky: true,
                opacity: 0.9,
                className: "multi-region-tooltip",
            });
        }
        return multiTooltip;
    }

    /**
     * Show preview popups for a single shape's targets.
     * Returns true if a preview was shown.
     */
    function showShapePreview(shape: MapRegion): boolean {
        if (isConsoleOpen) return false;

        const { pagePath, mapTargetPath } = resolveTargetPaths(shape);
        const layer = shapeIdToLayer.get(shape.id);
        const element =
            layer && (layer as any).getElement
                ? (layer as any).getElement()
                : null;

        let foundPreview = false;

        if (pagePath && element) {
            hoveredPath = pagePath;
            hoveredElement = element;
            foundPreview = true;
        }

        if (mapTargetPath && element) {
            hoveredMapPath = mapTargetPath;
            hoveredMapElement = element;
            foundPreview = true;
        }

        return foundPreview;
    }

    // =========================================================================
    // LAYER HANDLERS (toggling visibility/opacity)
    // =========================================================================

    async function updateLayer(layerId: string, patch: Partial<MapLayer>) {
        if (!data.path) return;
        try {
            await updateMapConfig(data.path, (currentConfig) => ({
                ...currentConfig,
                layers: currentConfig.layers.map((l) =>
                    l.id === layerId ? { ...l, ...patch } : l,
                ),
            }));
        } catch (e) {
            console.error("Failed to update layer", e);
        }
    }

    // =========================================================================
    // REACTIVE EFFECTS (hover highlights, styling, cleanup)
    // =========================================================================

    // Handle pin highlighting from console
    $effect(() => {
        // Subscribe to layerRevision to ensure we run after re-renders
        void layerRevision;

        if (highlightedPinId && pinIdToLayer.has(highlightedPinId)) {
            const marker = pinIdToLayer.get(highlightedPinId);
            const pinConfig = mapConfig?.pins.find(
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
            if (mapConfig) {
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

        if (mapConfig) {
            mapConfig.shapes.forEach((s) => {
                const layer = shapeIdToLayer.get(s.id);
                if (layer) {
                    const isTargeted =
                        s.id === highlightedRegionId ||
                        hoveredRegionIds.has(s.id);

                    if (isTargeted) {
                        layer.setStyle(REGION_STYLES.highlighted);
                        layer.bringToFront();
                    } else if (isConsoleOpen) {
                        layer.setStyle(REGION_STYLES.visible);
                    } else {
                        layer.setStyle(REGION_STYLES.hidden);
                    }
                }
            });
        }

        // Handle explicit console hover tooltip
        // We use multiTooltip manually here because we removed bindTooltip from regions to avoid duplication
        if (highlightedRegionId) {
            const layer = shapeIdToLayer.get(highlightedRegionId);
            const s = mapConfig?.shapes.find(
                (s) => s.id === highlightedRegionId,
            );
            if (layer && s) {
                const tooltip = getOrCreateMultiTooltip();
                // Force tooltip to center of region for console hover
                const center = (layer as any).getBounds().getCenter();
                tooltip
                    .setLatLng(center)
                    .setContent(s.label || "Region")
                    .addTo(map!);
            }
        } else if (hoveredRegionIds.size === 0 && !hoveredPinId) {
            // If not highlighting from console, AND not hovering map regions, AND not hovering pin
            // Cleanup tooltip. This cleans up when leaving the console item.
            removeMultiTooltip();
        }
    });

    // Reactive Effect to Hide Previews when Context Menu or Console is Open
    $effect(() => {
        if (contextMenu?.show || isConsoleOpen) {
            // Clear Link and Map Previews
            clearAllPreviews();

            // Clear Multi-Region Tooltip
            // NOTE: We do NOT clear it here if isConsoleOpen is true and we are highlighting a region
            // But this effect runs when isConsoleOpen changes.
            // The styling effect above manages the tooltip for highlightedRegionId.
            // This block is mostly for cleaning up "stuck" previews when modes change.
            if (multiTooltip && !highlightedRegionId) {
                removeMultiTooltip();
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

    // Map Path Change — destroy and recreate when navigating between maps
    $effect(() => {
        if (mapConfig && mapElement) {
            if (currentMapPath !== data.path) {
                destroyMap();
                currentMapPath = data.path;
            }
            updateMap(mapConfig);
        }
    });

    // =========================================================================
    // MAP LIFECYCLE (create, update, destroy)
    // =========================================================================

    /**
     * Resets all overlay and layer group state.
     * Used by both destroyMap and handleStructuralChanges.
     */
    function resetMapLayers() {
        imageOverlays.clear();
        markerLayerGroup = null;
        shapeLayerGroup = null;
        drawLayerGroup = null;
        pinIdToLayer.clear();
        shapeIdToLayer.clear();
        removeMultiTooltip();
    }

    function destroyMap() {
        if (map) {
            map.remove();
            map = null;
            resetMapLayers();
            prevConfig = null;
        }
    }

    function updateMap(config: MapConfig) {
        // Prevent unnecessary re-renders (Fixes zoom flashing/resetting)
        // Reference equality works because updateMapConfig/registerMap always
        // produce new config objects — no mutation of existing references.
        if (config === prevConfig && map) {
            return;
        }
        prevConfig = config;

        if (!mapElement) return;
        error = null;

        try {
            handleStructuralChanges(config);
            if (!map) {
                initializeMap(config);
            }

            syncImageLayers(config);
            syncPins(config);
            syncShapes(config);

            // Signal styling effects that layers are rebuilt
            layerRevision += 1;
        } catch (e: any) {
            console.error("Map Error:", e);
            error = `Map Error: ${e.message}`;
        }
    }

    // =========================================================================
    // MAP INITIALIZATION
    // =========================================================================

    /**
     * Check if major structural changes occurred (Dimensions or Base Image).
     * If so, we must destroy and recreate the map to update bounds and base layer correctly.
     * This is simpler and faster than a full JSON hash.
     */
    function handleStructuralChanges(config: MapConfig) {
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
            resetMapLayers();
        }

        // Update tracking state
        prevStructure = {
            w: config.width,
            h: config.height,
            baseImage: currentBaseImage,
        };
    }

    /**
     * Create the Leaflet map instance and attach all global event listeners.
     */
    function initializeMap(config: MapConfig) {
        const w = config.width;
        const h = config.height;
        // Define bounds: Top-Left [0,0] to Bottom-Right [height, width]
        // In CRS.Simple, [0,0] is bottom-left. We map our top-left to [h, 0]
        const bounds: L.LatLngBoundsExpression = [
            [0, 0],
            [h, w],
        ];

        map = L.map(mapElement!, {
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

        // --- Attach Global Event Listeners ---
        attachContextMenuHandler(h);
        attachMouseMoveHandler(h);
        attachClickHandler(h);
        attachDrawingHandler();
        attachCleanupHandlers();
    }

    // =========================================================================
    // GLOBAL EVENT HANDLERS (extracted from initializeMap for readability)
    // =========================================================================

    function attachContextMenuHandler(mapHeight: number) {
        map!.on("contextmenu", (e: L.LeafletMouseEvent) => {
            if (isDrawing) return; // Don't show context menu while drawing
            if (!mapConfig) return;

            const mapX = e.latlng.lng;
            const mapY = mapHeight - e.latlng.lat; // Convert Leaflet LatLng to Map Coords (Y-flip)
            // Find all shapes under cursor (with layer visibility filtering)
            const shapesAtCursor = getShapesAtPoint(
                mapX,
                mapY,
                mapConfig.shapes,
                mapConfig.layers,
            );

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
                    ...(editActions.length > 0 || deleteActions.length > 0
                        ? [{ isSeparator: true } as any]
                        : []),
                    ...editActions,
                    ...deleteActions,
                ],
            };
        });
    }

    // Handle Hover for Overlapping Regions (Multi-Tooltip + Highlight Sync)
    function attachMouseMoveHandler(mapHeight: number) {
        map!.on("mousemove", (e: L.LeafletMouseEvent) => {
            if (isDrawing) return;
            // Prevent showing tooltip if context menu is open
            // We ALLOW it if console is open now, but we will block full previews below
            if (contextMenu?.show) return;
            if (!mapConfig) return;

            // 1. PIN PRIORITY: If hovering a pin, hide region tooltips and return
            if (hoveredPinId) {
                removeMultiTooltip();
                // Clear highlight when moving from region to pin
                hoveredRegionIds = new Set();
                return;
            }

            const mapX = e.latlng.lng;
            const mapY = mapHeight - e.latlng.lat;
            // Use shared utility with layer visibility filtering
            const shapes = getShapesAtPoint(
                mapX,
                mapY,
                mapConfig.shapes,
                mapConfig.layers,
            );

            // 2. SYNC HOVER HIGHLIGHT STATE
            // Only update state if the set of IDs has actually changed.
            const foundIds = new Set(shapes.map((s) => s.id));
            if (!setsEqual(foundIds, hoveredRegionIds)) {
                hoveredRegionIds = foundIds;
            }

            // 3. TOOLTIP LOGIC
            if (shapes.length > 0) {
                let content = "";

                // Condition 1: Single Region
                if (shapes.length === 1) {
                    content = shapes[0].label || "Region";
                    // --- HANDLE PREVIEWS FOR SINGLE REGION ---
                    // Only show full link previews if Console is CLOSED
                    if (!showShapePreview(shapes[0])) {
                        clearAllPreviews();
                    }
                } else {
                    // Condition 2: Overlapping Regions — show bullet list
                    const listItems = shapes
                        .map((s) => `<li>${s.label || "Unnamed Region"}</li>`)
                        .join("");
                    content = `<ul style="margin: 0; padding-left: 1.2rem; list-style-type: disc;">${listItems}</ul>`;
                    // --- HIDE PREVIEWS ON OVERLAP ---
                    clearAllPreviews();
                }

                const tooltip = getOrCreateMultiTooltip();
                tooltip.setLatLng(e.latlng).setContent(content).addTo(map!);
            } else {
                // No shapes under cursor
                removeMultiTooltip();
                // Clear previews
                clearAllPreviews();
            }
        });
    }

    function attachClickHandler(mapHeight: number) {
        map!.on("click", (e: L.LeafletMouseEvent) => {
            if (!isDrawing) {
                if (!mapConfig) return;

                // Handle Click Disambiguation for Overlapping Regions
                // Note: This only runs if the click wasn't stopped by a Pin
                const mapX = e.latlng.lng;
                const mapY = mapHeight - e.latlng.lat;

                // Find shapes with navigation targets (with layer visibility filtering)
                const shapes = getShapesAtPoint(
                    mapX,
                    mapY,
                    mapConfig.shapes,
                    mapConfig.layers,
                ).filter((s) => s.targetPage || s.targetMap);

                if (shapes.length === 0) return;

                // If only one target, navigate directly
                if (shapes.length === 1) {
                    navigateToTarget(
                        shapes[0],
                        e.originalEvent.clientX,
                        e.originalEvent.clientY,
                    );
                    return;
                }

                // Multiple targets — show disambiguation menu
                const actions = shapes.flatMap((s) => {
                    const acts: { label: string; handler: () => void }[] = [];
                    if (s.targetPage) {
                        acts.push({
                            label: `Go to Page: ${s.targetPage} (${s.label || "Region"})`,
                            handler: () => navigateToPageByTitle(s.targetPage!),
                        });
                    }
                    if (s.targetMap) {
                        acts.push({
                            label: `Go to Map: ${s.targetMap} (${s.label || "Region"})`,
                            handler: () => navigateToMapByTitle(s.targetMap!),
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

            // --- Drawing mode click ---
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
    }

    function attachDrawingHandler() {
        // Finisher for polygon (double click)
        map!.on("dblclick", (_e: L.LeafletMouseEvent) => {
            if (isDrawing && drawMode === "polygon") {
                finishDrawing();
            }
        });
    }

    function attachCleanupHandlers() {
        // Clear highlights when leaving the map area
        map!.on("mouseout", () => {
            hoveredRegionIds = new Set();
        });

        map!.on("click movestart zoomstart", () => {
            // While drawing, clicks are handled by separate listener
            if (!isDrawing) contextMenu = null;
        });
    }

    // =========================================================================
    // MAP SYNC (image layers, pins, shapes)
    // =========================================================================

    // --- SYNC IMAGE LAYERS (Updates Dynamic State) ---
    function syncImageLayers(config: MapConfig) {
        const bounds: L.LatLngBoundsExpression = [
            [0, 0],
            [config.height, config.width],
        ];
        const currentLayerIds = new Set<string>();

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

            const imagePath = $imagePathLookup.get(layer.image.toLowerCase());
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
    }

    // --- Update Pins ---
    function syncPins(config: MapConfig) {
        if (!markerLayerGroup) return;

        markerLayerGroup.clearLayers();
        pinIdToLayer.clear();

        const h = config.height;

        config.pins.forEach((pin: MapPin) => {
            if (!isLayerVisible(pin.layerId, config.layers)) return;

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
        });
    }

    // --- Update Regions (Shapes) ---
    function syncShapes(config: MapConfig) {
        if (!shapeLayerGroup) return;

        shapeLayerGroup.clearLayers();
        shapeIdToLayer.clear();

        const h = config.height;

        config.shapes.forEach((shape: MapRegion) => {
            if (!isLayerVisible(shape.layerId, config.layers)) return;

            let layer: L.Path;
            const color = shape.color || DEFAULT_SHAPE_COLOR;

            // Initial style setup - invisible by default
            // Note: We create them invisibly, allowing the reactive effect
            // or map interaction logic to reveal them.
            const initialStyle = {
                color: color,
                fillColor: color,
                ...REGION_STYLES.hidden,
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

    // =========================================================================
    // DRAWING
    // =========================================================================

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

    /** Resets all drawing state. Used by both cancel and finish. */
    function cancelDrawing() {
        isDrawing = false;
        drawMode = null;
        if (drawLayerGroup) drawLayerGroup.clearLayers();
        if (map) map.doubleClickZoom.enable();
    }

    function finishDrawing() {
        // mapConfig is kept in sync with the store via the $effect that
        // subscribes to $loadedMaps, so we can use it directly here.
        // The modal's save handler uses updateMapConfig which reads from the
        // store's own serialized queue, so there is no stale-data risk.
        if (!mapConfig) {
            console.error("Cannot finish drawing: Map config not found.");
            return;
        }

        const h = mapConfig.height;
        let shapeData: any;

        if (drawMode === "polygon" && tempPoints.length >= 3) {
            // Convert LatLngs back to map coordinates (Y flip)
            const points = tempPoints.map((p) => ({
                x: Math.round(p.lng),
                y: Math.round(h - p.lat),
            }));
            shapeData = { type: "polygon", points };
        }

        cancelDrawing();

        if (shapeData) {
            addRegion(data.path, mapConfig, shapeData);
        }
    }

    // =========================================================================
    // CRUD HANDLERS (Add/Edit/Delete pins and regions)
    // =========================================================================

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
        addPin(data.path, mapConfig, mapX, mapY);
    }

    function handleEditPin(pinId: string) {
        const pin = mapConfig?.pins.find((p) => p.id === pinId);
        if (!pin || !mapConfig) return;

        contextMenu = null;
        editPin(data.path, mapConfig, pin);
    }

    function handleEditRegion(region: MapRegion) {
        if (!mapConfig) return;

        contextMenu = null;
        editRegion(data.path, mapConfig, region);
    }

    function handleDeletePin(pinId: string) {
        contextMenu = null;
        deletePin(data.path, pinId);
    }

    function handleDeleteShape(shapeId: string) {
        contextMenu = null;
        deleteShape(data.path, shapeId);
    }
</script>

<!-- ======================================================================= -->
<!-- TEMPLATE                                                                -->
<!-- ======================================================================= -->

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
                    <Button size="small" onclick={cancelDrawing}
                        >Cancel Drawing</Button
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
                    onToggle={(id, visible) => updateLayer(id, { visible })}
                    onOpacityChange={(id, opacity) =>
                        updateLayer(id, { opacity })}
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
                    {activeRegionIds}
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

<!-- ======================================================================= -->
<!-- STYLES                                                                  -->
<!-- ======================================================================= -->

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
