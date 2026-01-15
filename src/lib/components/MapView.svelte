<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { get } from "svelte/store";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import { currentView } from "$lib/viewStores";
    import { loadedMaps, registerMap, loadMapConfig } from "$lib/mapStore";
    import {
        imagePathLookup,
        pagePathLookup,
        mapPathLookup,
    } from "$lib/worldStore";
    import { writePageContent } from "$lib/commands";
    import type { MapConfig, MapPin, MapRegion } from "$lib/mapModels";
    import type { PageHeader } from "$lib/bindings";
    import ErrorBox from "./ErrorBox.svelte";
    import ViewHeader from "./ViewHeader.svelte";
    import ContextMenu from "./ContextMenu.svelte";
    import AddPinModal from "./AddPinModal.svelte";
    import AddRegionModal from "./AddRegionModal.svelte";
    import ConfirmModal from "./ConfirmModal.svelte";
    import { openModal, closeModal } from "$lib/modalStore";
    import Button from "./Button.svelte";

    let { data } = $props<{ data: PageHeader }>();

    let mapElement: HTMLElement;
    let map: L.Map | null = null;
    let markerLayerGroup: L.LayerGroup | null = null;
    let shapeLayerGroup: L.LayerGroup | null = null;
    // Temp layer for drawing in progress
    let drawLayerGroup: L.LayerGroup | null = null;
    let error = $state<string | null>(null);
    let currentMapPath: string | null = null;
    let prevConfigStr = ""; // Track config state to prevent re-renders

    // Drawing State
    let isDrawing = $state(false);
    let drawMode = $state<"polygon" | null>(null);
    let tempPoints: L.LatLng[] = [];
    let tempLayer: L.Layer | null = null; // Visual feedback during draw

    let contextMenu = $state<{
        x: number;
        y: number;
        show: boolean;
        mapX?: number;
        mapY?: number;
        pinId?: string;
        shapeId?: string; // Context for shapes
        // Custom actions for the context menu (used for the dual-link choice)
        customActions?: { label: string; handler: () => void }[];
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

    function createEmojiIcon(emoji: string, color: string = "#ffffff") {
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="32" height="48">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24c0-6.63-5.37-12-12-12z" fill="${color}" stroke="#444" stroke-width="1.5"/>
                <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="14" font-family="Segoe UI Emoji, Apple Color Emoji, sans-serif" dy="1">${emoji}</text>
            </svg>
        `;

        return L.divIcon({
            className: "custom-pin-marker",
            html: svg,
            iconSize: [32, 48],
            iconAnchor: [16, 48],
            popupAnchor: [0, -48],
        });
    }

    onMount(() => {
        if (mapConfig) {
            updateMap(mapConfig);
        }
    });

    onDestroy(() => {
        if (map) {
            map.remove();
            map = null;
            markerLayerGroup = null;
            shapeLayerGroup = null;
            drawLayerGroup = null;
        }
    });

    $effect(() => {
        if (mapConfig && mapElement) {
            if (currentMapPath !== data.path) {
                if (map) {
                    map.remove();
                    map = null;
                    markerLayerGroup = null;
                    shapeLayerGroup = null;
                    drawLayerGroup = null;
                    prevConfigStr = ""; // Reset config tracking
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
                };
            } else if (item.targetMap) {
                navigateToMap(item.targetMap);
            } else if (item.targetPage) {
                navigateToPage(item.targetPage);
            }
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

                const sortedLayers = [...config.layers].sort(
                    (a, b) => a.zIndex - b.zIndex,
                );
                sortedLayers.forEach((layer) => {
                    if (!layer.visible) return;
                    const imagePath = $imagePathLookup.get(
                        layer.image.toLowerCase(),
                    );
                    if (imagePath) {
                        const assetUrl = convertFileSrc(imagePath);
                        L.imageOverlay(assetUrl, bounds).addTo(map!);
                    }
                });

                // Calculate the optimal zoom to fit the image exactly in the container
                // This ensures the map always fills the screen on load
                const fitZoom = map.getBoundsZoom(bounds);

                // Set the initial view to the calculated fit zoom level
                map.setView([h / 2, w / 2], fitZoom, { animate: false });

                // Set this fitZoom as the absolute minimum zoom level allowed
                // This prevents the user from zooming out further than the image boundaries
                map.setMinZoom(fitZoom);

                markerLayerGroup = L.layerGroup().addTo(map);
                shapeLayerGroup = L.layerGroup().addTo(map);
                drawLayerGroup = L.layerGroup().addTo(map);

                map.on("contextmenu", (e: L.LeafletMouseEvent) => {
                    if (isDrawing) return; // Don't show context menu while drawing

                    const mapX = e.latlng.lng;
                    const mapY = h - e.latlng.lat;
                    contextMenu = {
                        x: e.originalEvent.clientX,
                        y: e.originalEvent.clientY,
                        show: true,
                        mapX,
                        mapY,
                    };
                });

                map.on("click movestart zoomstart", () => {
                    // While drawing, clicks are handled by separate listener
                    if (!isDrawing) contextMenu = null;
                });

                // --- Drawing Interactions ---
                map.on("click", (e: L.LeafletMouseEvent) => {
                    if (!isDrawing) return;

                    if (drawMode === "polygon") {
                        tempPoints.push(e.latlng);

                        if (!tempLayer) {
                            // First point: Create the layer with interactive: false
                            // This ensures click/dblclick events pass through to the map
                            tempLayer = L.polyline(tempPoints, {
                                color: "red",
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
                map.on("dblclick", (e: L.LeafletMouseEvent) => {
                    if (isDrawing && drawMode === "polygon") {
                        // Pass the LATEST config (mapConfig), not the stale 'config' from closure
                        // Since mapConfig is reactive, we can just access it here (it's in the component scope)
                        finishDrawing();
                    }
                });
            }

            // --- Update Pins ---
            if (markerLayerGroup) {
                markerLayerGroup.clearLayers();
            }
            if (config.pins && markerLayerGroup) {
                config.pins.forEach(
                    (pin: MapPin & { icon?: string; color?: string }) => {
                        const leafletLat = h - pin.y;
                        const leafletLng = pin.x;
                        const iconToUse = createEmojiIcon(
                            pin.icon || "📍",
                            pin.color || "#ffffff",
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

                        marker.bindTooltip(tooltipText, {
                            direction: "top",
                            offset: [0, -40],
                        });

                        attachClickBehavior(marker, pin);

                        marker.on("contextmenu", (e: L.LeafletMouseEvent) => {
                            contextMenu = {
                                x: e.originalEvent.clientX,
                                y: e.originalEvent.clientY,
                                show: true,
                                pinId: pin.id,
                            };
                        });

                        marker.addTo(markerLayerGroup!);
                    },
                );
            }

            // --- Update Regions (Shapes) ---
            if (shapeLayerGroup) {
                shapeLayerGroup.clearLayers();
            }
            if (config.shapes && shapeLayerGroup) {
                config.shapes.forEach((shape: MapRegion) => {
                    let layer: L.Layer;
                    const color = shape.color || "#3498db";

                    if (shape.type === "polygon") {
                        const latLngs = shape.points.map(
                            (p) => [h - p.y, p.x] as [number, number],
                        );
                        layer = L.polygon(latLngs, {
                            color: color,
                            fillColor: color,
                            fillOpacity: 0.2,
                        });
                    } else {
                        return;
                    }

                    if (shape.label) {
                        layer.bindTooltip(shape.label, { sticky: true });
                    }

                    attachClickBehavior(layer, shape);

                    // Context menu for shapes
                    layer.on("contextmenu", (e: L.LeafletMouseEvent) => {
                        if (isDrawing) return;

                        L.DomEvent.stopPropagation(e); // Stop propagation to map
                        L.DomEvent.preventDefault(e); // Prevent browser menu

                        // Prevent the map's own contextmenu event from firing
                        // by creating the context menu here and stopping propagation.
                        const mapX = e.latlng.lng;
                        const mapY = h - e.latlng.lat;

                        contextMenu = {
                            x: e.originalEvent.clientX,
                            y: e.originalEvent.clientY,
                            show: true,
                            shapeId: shape.id,
                            // Ensure general map coordinates are also captured so "Add Pin Here" works
                            mapX,
                            mapY,
                        };
                    });

                    layer.addTo(shapeLayerGroup!);
                });
            }
        } catch (e: any) {
            console.error("Map Error:", e);
            error = `Map Error: ${e.message}`;
        }
    }

    // --- Drawing Handlers ---

    function startDrawing(mode: "polygon") {
        isDrawing = true;
        drawMode = mode;
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
                component: AddRegionModal,
                props: {
                    onClose: closeModal,
                    mapPath: data.path,
                    mapConfig: currentConfig, // Pass the fresh config
                    shapeData: shapeData,
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
            component: AddPinModal,
            props: {
                onClose: closeModal,
                mapPath: data.path,
                mapConfig: mapConfig,
                x: mapX,
                y: mapY,
            },
        });
    }

    function handleDeletePin(pinId: string) {
        if (!mapConfig) return;
        const currentConfig = mapConfig;
        contextMenu = null;
        openModal({
            component: ConfirmModal,
            props: {
                title: "Delete Pin",
                message: "Are you sure you want to delete this pin?",
                onClose: closeModal,
                onConfirm: async () => {
                    try {
                        const updatedConfig = {
                            ...currentConfig,
                            pins: currentConfig.pins.filter(
                                (p) => p.id !== pinId,
                            ),
                        };
                        await writePageContent(
                            data.path,
                            JSON.stringify(updatedConfig, null, 2),
                        );
                        registerMap(data.path, updatedConfig);
                        closeModal();
                    } catch (e) {
                        alert("Failed to delete pin.");
                    }
                },
            },
        });
    }

    function handleDeleteShape(shapeId: string) {
        if (!mapConfig) return;
        const currentConfig = mapConfig;
        contextMenu = null;
        openModal({
            component: ConfirmModal,
            props: {
                title: "Delete Region",
                message: "Are you sure you want to delete this region?",
                onClose: closeModal,
                onConfirm: async () => {
                    try {
                        const updatedConfig = {
                            ...currentConfig,
                            shapes: (currentConfig.shapes || []).filter(
                                (s) => s.id !== shapeId,
                            ),
                        };
                        await writePageContent(
                            data.path,
                            JSON.stringify(updatedConfig, null, 2),
                        );
                        registerMap(data.path, updatedConfig);
                        closeModal();
                    } catch (e) {
                        alert("Failed to delete region.");
                    }
                },
            },
        });
    }
</script>

<div class="map-view-container">
    <ViewHeader>
        <div slot="left">
            <h2 class="view-title">{data?.title.replace(".map.json", "")}</h2>
        </div>
        <div slot="right">
            <!-- Draw Controls -->
            {#if isDrawing}
                <div class="draw-controls">
                    <span class="draw-hint">
                        {drawMode === "polygon"
                            ? "Click to add points. Double-click to finish."
                            : "Draw mode active"}
                    </span>
                    <Button
                        size="small"
                        onclick={() => {
                            isDrawing = false;
                            drawLayerGroup?.clearLayers();
                            map?.doubleClickZoom.enable();
                        }}>Cancel</Button
                    >
                </div>
            {/if}
        </div>
    </ViewHeader>

    {#if error}
        <div class="error-container">
            <ErrorBox title="Map Error">{error}</ErrorBox>
        </div>
    {:else if !mapConfig}
        <div class="status-container"><p>Loading Map Configuration...</p></div>
    {:else}
        <div class="map-wrapper" class:drawing={isDrawing}>
            <div bind:this={mapElement} class="leaflet-container"></div>
        </div>
    {/if}

    {#if contextMenu && contextMenu.show}
        <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => (contextMenu = null)}
            actions={contextMenu.customActions
                ? contextMenu.customActions
                : [
                      // Only show Delete options if a specific ID is present
                      ...(contextMenu.pinId
                          ? [
                                {
                                    label: "Delete Pin",
                                    handler: () =>
                                        contextMenu?.pinId &&
                                        handleDeletePin(contextMenu.pinId),
                                },
                            ]
                          : []),
                      // Add a separator if we have deletion options AND we're about to add creation options
                      ...(contextMenu.pinId ? [{ isSeparator: true }] : []),
                      // Always show creation options (Add Pin, Draw Region)
                      {
                          label: "Add Pin Here...",
                          handler: handleAddPin,
                      },
                      { isSeparator: true },
                      {
                          label: "Draw Polygon Region",
                          handler: () => startDrawing("polygon"),
                      },
                      ...(contextMenu.shapeId
                          ? [
                                {
                                    label: "Delete Region",
                                    handler: () =>
                                        contextMenu?.shapeId &&
                                        handleDeleteShape(contextMenu.shapeId),
                                },
                            ]
                          : []),
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
    .draw-hint {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-style: italic;
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

    /* Optimized marker style: drop-shadow moved here for better performance */
    :global(.custom-pin-marker) {
        background: transparent;
        border: none;
        filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3));
        will-change: transform; /* Hint to browser to optimize layering */
    }
</style>
