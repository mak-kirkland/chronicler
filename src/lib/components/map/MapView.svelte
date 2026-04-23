<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import L from "leaflet";
    import "leaflet/dist/leaflet.css";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import { listen } from "@tauri-apps/api/event";
    import { navigateToPageByTitle, navigateToMapByTitle } from "$lib/actions";
    import {
        loadedMaps,
        loadMapConfig,
        updateMapConfig,
        getLayerTileInfo,
        lookupTileInfo,
        tileInfoStore,
    } from "$lib/mapStore";
    import type { TileSetInfo } from "$lib/mapModels";
    import ProgressBar from "$lib/components/ui/ProgressBar.svelte";
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
        buildLayerVisibilityLookup,
        isLayerIdVisible,
        setsEqual,
        toLeafletLat,
        toMapY,
        pinFingerprint,
        shapeFingerprint,
        ShapeSpatialIndex,
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
    import { throttle } from "$lib/utils";
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
    import {
        areLinkPreviewsEnabled,
        areMapPreviewsEnabled,
    } from "$lib/settingsStore";

    let { data } = $props<{ data: PageHeader }>();

    // -------------------------------------------------------------------------
    // Hoisted Leaflet class: tile layer that serves from the Rust-generated
    // on-disk pyramid. Defined once at module scope rather than re-extending
    // L.GridLayer per call.
    //
    // Each instance is given its own `tileDir` and `tileExt` via options.
    // Because we use a custom Y-down CRS (see `initializeMap`), Leaflet's
    // tile coordinates map directly to the tiler's column/row indices — no
    // Y-flip math required. `coords.z` is the pyramid zoom level;
    // `coords.x`/`coords.y` index into the file path
    // `{tileDir}/{z}/{x}_{y}.{tileExt}` (jpg for opaque sources, png for
    // sources with an alpha channel).
    // -------------------------------------------------------------------------
    const TileGridLayer = L.GridLayer.extend({
        createTile(
            this: L.GridLayer & {
                options: { tileDir: string; tileExt: string };
            },
            coords: L.Coords,
            done: (err: Error | null, tile: HTMLElement) => void,
        ): HTMLElement {
            const tile = document.createElement("img");
            tile.setAttribute("role", "presentation");
            const tilePath = `${this.options.tileDir}/${coords.z}/${coords.x}_${coords.y}.${this.options.tileExt}`;
            tile.src = convertFileSrc(tilePath);
            tile.onload = () => done(null, tile);
            tile.onerror = () => {
                tile.src = "";
                done(null, tile);
            };
            return tile;
        },
    });

    /**
     * Tile pixel size. **MUST match `TILE_SIZE` in `src-tauri/src/tiler.rs`**
     * — used in the max-zoom formula and as the `tileSize` option on every
     * `L.GridLayer` we mount. A mismatch makes Leaflet request tiles that
     * don't exist (or misalign existing ones).
     */
    const TILE_SIZE = 512;

    /**
     * Compute the max zoom level of the tile pyramid for an image of the
     * given dimensions.
     *
     * **This formula MUST stay in sync with `calculate_max_zoom` in
     * `src-tauri/src/tiler.rs`.** Both must produce the same number for the
     * same image dimensions, or Leaflet will request tiles that don't exist.
     *
     * For an 8640×5400 image with TILE_SIZE=512: ceil(log2(8640/512)) = 5.
     */
    function tileMaxZoomFor(width: number, height: number): number {
        return Math.ceil(Math.log2(Math.max(width, height) / TILE_SIZE));
    }

    // --- Core Leaflet State ---

    let mapElement = $state<HTMLElement | null>(null);
    let map: L.Map | null = null;

    // Layer Groups to manage different types of content
    let imageOverlays = new Map<string, L.ImageOverlay | L.GridLayer>();

    // Tile-cache lookup state, keyed by lowercased image filename. We do a
    // cheap read-only lookup before mounting any layer so cache hits skip
    // the full-resolution image fallback. `cacheMisses` is reactive so the
    // sync effect re-runs when a lookup confirms a miss.
    let cacheMisses = $state(new Set<string>());
    const lookupsInFlight = new Set<string>();
    let markerLayerGroup: L.LayerGroup | null = null;
    let shapeLayerGroup: L.LayerGroup | null = null;
    // Temp layer for drawing in progress
    let drawLayerGroup: L.LayerGroup | null = null;
    // Single canvas renderer shared across every shape on the map. Drops
    // shape rendering from one SVG node per polygon to a single <canvas>
    // batch, which is 10–50× faster on dense maps.
    let shapeRenderer: L.Canvas | null = null;

    // --- Map Data ---

    let error = $state<string | null>(null);
    // Fetch the map config on mount or when path changes.
    //
    // Critical: use $state.raw, NOT $state. The default $state recursively
    // wraps every nested object/array in a Proxy. A real-world map can hold
    // hundreds of thousands of point objects (one per polygon vertex), and
    // proxying all of them on assignment hangs the main thread for minutes.
    // Reassignment still triggers reactivity — we just don't pay for deep
    // observation we never use. Safe because updateMapConfig always produces
    // a brand-new MapConfig object rather than mutating in place.
    let mapConfig = $state.raw<MapConfig | null>(null);
    // Cached layer-visibility Map. Rebuilds only when mapConfig is reassigned
    // (the only way it can change given $state.raw). Hot loops — spatial
    // queries on every mousemove, syncPins/syncShapes — read from this
    // instead of doing an O(layers) array scan per item.
    let layerVisibilityLookup = $derived(
        mapConfig ? buildLayerVisibilityLookup(mapConfig.layers) : null,
    );
    let currentMapPath: string | null = null;
    // Track previous config reference to skip no-op updates.
    // Since updateMapConfig/registerMap always produce new objects,
    // reference equality is sufficient and avoids O(n) JSON serialization.
    let prevConfig: MapConfig | null = null;

    // Track state to know when to fully re-init map.
    // We only need to check these 3 properties — much faster than JSON hashing.
    let prevStructure = { w: 0, h: 0, baseImage: "" };

    // --- Tile Progress State ---
    // Plain object indexed by image filename. Svelte 5's $state proxies the
    // object so direct mutation (set / delete) triggers reactivity - no need
    // for the Map-reassignment dance.
    let tileProgress = $state<
        Record<string, { current: number; total: number; phase: string }>
    >({});
    let tilesLoading = $derived(Object.keys(tileProgress).length > 0);

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

    // When both previews are active, display them side by side:
    // LinkPreview (page infobox) on the left, MapPreview on the right.
    let bothPreviewsActive = $derived(
        !!(
            hoveredPath &&
            hoveredElement &&
            hoveredMapPath &&
            hoveredMapElement
        ),
    );
    let linkPreviewSideBias = $derived<"left" | null>(
        bothPreviewsActive ? "left" : null,
    );
    let mapPreviewSideBias = $derived<"right" | null>(
        bothPreviewsActive ? "right" : null,
    );

    // 1×1 hidden anchor used as `hoveredElement` for canvas-rendered
    // shapes. The link/map preview popups position themselves relative
    // to a DOM element via `getBoundingClientRect()`, but `L.Path`'s
    // `getElement()` returns nothing under the canvas renderer — there's
    // no per-shape DOM node anymore. This single anchor is moved to the
    // hovered shape's screen-space center instead.
    let previewAnchor = $state<HTMLElement | null>(null);
    // Bumped each time `previewAnchor` is repositioned so HoverPreview
    // recomputes its layout — without this, switching from one shape to
    // another doesn't change `hoveredElement`'s reference and the popup
    // would stay parked at the previous coords.
    let previewAnchorVersion = $state(0);

    // --- Tooltip & Lookup State ---

    // Tooltip State for multi-region hover
    let multiTooltip: L.Tooltip | null = null;
    // Lookup for layers to support console highlighting
    let pinIdToLayer = new Map<string, L.Marker>();
    let shapeIdToLayer = new Map<string, L.Path>();

    // --- Performance: Diff-based sync tracking ---
    // Fingerprints of the last synced pins/shapes for diffing
    let prevPinFingerprints = new Map<string, string>();
    let prevShapeFingerprints = new Map<string, string>();
    // Previous highlight ID for targeted reset (avoids resetting ALL pins)
    let prevHighlightedPinId: string | null = null;

    // --- Performance: Spatial index for shape hit-testing ---
    let spatialIndex: ShapeSpatialIndex | null = null;
    // Tracks which shapes array the index was built from, so syncShapes
    // can skip the O(N) rebuild on viewport-only updates.
    let spatialIndexShapes: MapRegion[] | null = null;

    // --- Performance: Viewport culling ---
    // Image-pixel rectangle of what's currently on screen (with overdraw padding).
    // syncPins/syncShapes use this to skip mounting items outside the viewport.
    // null means "render everything" (used while bounds are not yet known).
    let visibleBounds: {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
    } | null = null;

    // --- Performance: Cached store subscriptions (avoids get() per event) ---
    let cachedPagePaths: Map<string, string> = new Map();
    let cachedMapPaths: Map<string, string> = new Map();

    // --- Performance: Previous region style state for targeted updates ---
    let prevStyledRegionIds = new Set<string>();
    let prevRegionStyleMode: "hidden" | "visible" = "hidden";

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

    let unlistenTileProgress: (() => void) | null = null;
    let destroyed = false;

    onMount(() => {
        // Render the map immediately if its config was already cached when
        // the component mounted (the load effect above is synchronous about
        // hitting the cache).
        if (mapConfig) {
            updateMap(mapConfig);
        }

        // Subscribe to tile-progress events. Because `listen()` is async, the
        // component may have been destroyed by the time the unlisten function
        // resolves — we guard against that to avoid leaking listeners on
        // rapid map navigation.
        listen<{
            image: string;
            current: number;
            total: number;
            phase: string;
        }>("tile-progress", (event) => {
            const { image, current, total, phase } = event.payload;

            // Filter to images this view actually uses. Progress events are
            // global, so otherwise we'd render bars for tiles being generated
            // by other open MapViews (or background prefetches).
            const target = image.toLowerCase();
            const inUse = mapConfig?.layers.some(
                (l) => l.image.toLowerCase() === target,
            );
            if (!inUse) return;

            if (current >= total) {
                delete tileProgress[image];
            } else {
                tileProgress[image] = { current, total, phase };
            }
        }).then((unlisten) => {
            if (destroyed) {
                unlisten();
            } else {
                unlistenTileProgress = unlisten;
            }
        });
    });

    onDestroy(() => {
        destroyed = true;
        unlistenTileProgress?.();
        destroyMap();
    });

    $effect(() => {
        // Touch both stores so the effect re-runs on either cache hit
        // (tileInfoStore) or confirmed miss (cacheMisses).
        const _tiles = $tileInfoStore;
        const _misses = cacheMisses;
        if (map && mapConfig) {
            syncImageLayers(mapConfig);
        }
    });

    // --- Performance: Subscribe to world store lookups once, cache locally ---
    // Avoids calling get(store) on every mouseover/click event.
    $effect(() => {
        cachedPagePaths = $pagePathLookup;
    });
    $effect(() => {
        cachedMapPaths = $mapPathLookup;
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
     * using cached world store lookups. Returns null for unresolved targets.
     */
    function resolveTargetPaths(item: {
        targetPage?: string;
        targetMap?: string;
    }) {
        const pagePath = item.targetPage
            ? (cachedPagePaths.get(item.targetPage.toLowerCase()) ?? null)
            : null;
        const mapTargetPath = item.targetMap
            ? (cachedMapPaths.get(item.targetMap.toLowerCase()) ?? null)
            : null;
        return { pagePath, mapTargetPath };
    }

    function clearAllPreviews() {
        hoveredPath = null;
        hoveredElement = null;
        hoveredMapPath = null;
        hoveredMapElement = null;
    }

    /**
     * Position the shared preview anchor at a container-pixel point and
     * point the link/map preview state at it. Bumps `previewAnchorVersion`
     * so HoverPreview re-runs its positioning effect even when
     * `hoveredElement` keeps the same DOM reference. Pass null for either
     * path to clear that preview without touching the other.
     */
    function placePreviewAt(
        containerX: number,
        containerY: number,
        pagePath: string | null,
        mapTargetPath: string | null,
    ) {
        if (!previewAnchor) return;
        previewAnchor.style.left = `${containerX}px`;
        previewAnchor.style.top = `${containerY}px`;
        hoveredPath = pagePath;
        hoveredElement = pagePath ? previewAnchor : null;
        hoveredMapPath = mapTargetPath;
        hoveredMapElement = mapTargetPath ? previewAnchor : null;
        // Write-only update: a `++` would *read* `previewAnchorVersion`,
        // and effects that call this helper would then track that read
        // and re-fire on the write — infinite loop. `performance.now()`
        // gives a fresh value every call without reading the prior one.
        previewAnchorVersion = performance.now();
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
     *
     * Shapes are drawn via the shared `L.canvas()` renderer, so they
     * have no individual DOM node — `layer.getElement()` returns the
     * shared canvas (or undefined) rather than a per-shape element. We
     * route the preview through `placePreviewAt`, anchoring at the
     * shape's bounds-center in container coords.
     */
    function showShapePreview(shape: MapRegion): boolean {
        if (isConsoleOpen || !map) return false;

        const { pagePath, mapTargetPath } = resolveTargetPaths(shape);
        if (!pagePath && !mapTargetPath) return false;

        const layer = shapeIdToLayer.get(shape.id);
        const center = (layer as any)?.getBounds?.()?.getCenter?.();
        if (!center) return false;

        const cp = map.latLngToContainerPoint(center);
        placePreviewAt(cp.x, cp.y, pagePath, mapTargetPath);
        return true;
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
    // Optimization: Only reset the previously highlighted pin, not all pins.
    $effect(() => {
        // Subscribe to layerRevision to ensure we run after re-renders
        void layerRevision;

        // 1. Reset previous highlight (just one pin, not all)
        if (prevHighlightedPinId && prevHighlightedPinId !== highlightedPinId) {
            const prevMarker = pinIdToLayer.get(prevHighlightedPinId);
            const prevPin = mapConfig?.pins.find(
                (p) => p.id === prevHighlightedPinId,
            );
            if (prevMarker && prevPin) {
                const iconChar = prevPin.icon || DEFAULT_PIN_ICON;
                const normalIcon = createEmojiIcon(
                    iconChar,
                    prevPin.color || DEFAULT_ICON_COLOR,
                    false,
                    !!prevPin.invisible,
                );
                prevMarker.setIcon(normalIcon);
                prevMarker.setZIndexOffset(0);
                if (prevPin.id !== hoveredPinId) {
                    prevMarker.closeTooltip();
                }
            }
        }

        // 2. Apply new highlight
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
                marker.setZIndexOffset(1000);
                marker.openTooltip();
            }
        }

        prevHighlightedPinId = highlightedPinId;
    });

    // Reactive Effect for Region Visibility & Styling
    // Optimization: Only restyle regions whose state actually changed.
    $effect(() => {
        // Subscribe to layerRevision to ensure we run after re-renders
        void layerRevision;

        if (mapConfig) {
            const currentMode: "hidden" | "visible" = isConsoleOpen
                ? "visible"
                : "hidden";

            // Compute which IDs are currently targeted (highlighted/hovered)
            const currentTargeted = new Set<string>();
            if (highlightedRegionId) currentTargeted.add(highlightedRegionId);
            for (const id of hoveredRegionIds) currentTargeted.add(id);

            // Determine which shapes need restyling:
            // 1. Shapes that were targeted but no longer are
            // 2. Shapes that are newly targeted
            // 3. All shapes if the base mode changed (console open/close) or layers rebuilt
            const modeChanged = currentMode !== prevRegionStyleMode;

            if (modeChanged) {
                // Mode changed — restyle everything
                mapConfig.shapes.forEach((s) => {
                    const layer = shapeIdToLayer.get(s.id);
                    if (!layer) return;
                    if (currentTargeted.has(s.id)) {
                        layer.setStyle(REGION_STYLES.highlighted);
                        layer.bringToFront();
                    } else if (currentMode === "visible") {
                        layer.setStyle(REGION_STYLES.visible);
                    } else {
                        layer.setStyle(REGION_STYLES.hidden);
                    }
                });
            } else {
                // Mode unchanged — only update shapes entering/leaving targeted state
                const baseStyle =
                    currentMode === "visible"
                        ? REGION_STYLES.visible
                        : REGION_STYLES.hidden;

                // Shapes leaving targeted state
                for (const id of prevStyledRegionIds) {
                    if (!currentTargeted.has(id)) {
                        const layer = shapeIdToLayer.get(id);
                        if (layer) layer.setStyle(baseStyle);
                    }
                }
                // Shapes entering targeted state
                for (const id of currentTargeted) {
                    if (!prevStyledRegionIds.has(id)) {
                        const layer = shapeIdToLayer.get(id);
                        if (layer) {
                            layer.setStyle(REGION_STYLES.highlighted);
                            layer.bringToFront();
                        }
                    }
                }
            }

            prevStyledRegionIds = currentTargeted;
            prevRegionStyleMode = currentMode;
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
        cacheMisses = new Set();
        lookupsInFlight.clear();
        markerLayerGroup = null;
        shapeLayerGroup = null;
        drawLayerGroup = null;
        shapeRenderer = null;
        pinIdToLayer.clear();
        shapeIdToLayer.clear();
        prevPinFingerprints.clear();
        prevShapeFingerprints.clear();
        prevStyledRegionIds = new Set();
        prevRegionStyleMode = "hidden";
        spatialIndex = null;
        spatialIndexShapes = null;
        visibleBounds = null;
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
            destroyMap();
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

        // The tile pyramid's max zoom level. This MUST match the formula used
        // by the Rust tiler — see `tileMaxZoomFor` near the top of this script.
        const tileMaxZoom = tileMaxZoomFor(w, h);

        // Custom CRS for image tile maps. Two key differences from CRS.Simple:
        //
        // 1. Y axis goes DOWN (not up). The transformation's `c` coefficient is
        //    positive (`+coeff` instead of CRS.Simple's `-1`), so lat=0 is the
        //    top of the image, lat=height is the bottom — matching image pixel
        //    coordinates and the tiler's row ordering. This means tile (col, row)
        //    from the tiler maps directly to Leaflet's (coords.x, coords.y) with
        //    no Y-flip math required.
        //
        // 2. Coefficient = 1/2^maxZoom scales the coordinate space so that at
        //    Leaflet zoom 0, a single 256×256 tile covers the entire image
        //    coordinate range (the overview tile). At Leaflet zoom = maxZoom,
        //    one tile covers exactly 256 coordinate units = 256 image pixels
        //    (native resolution). This ensures Leaflet's tile coordinate
        //    requests align perfectly with the tiler's output at every zoom.
        //
        // Without these adjustments, CRS.Simple's Y-flip and unit scaling caused
        // tile grid misalignment for non-power-of-2 images (the image would
        // shift by a fractional tile per zoom level).
        const crsCoeff = 1 / Math.pow(2, tileMaxZoom);
        const ImageCRS = L.extend({}, L.CRS.Simple, {
            transformation: new L.Transformation(crsCoeff, 0, crsCoeff, 0),
        });

        map = L.map(mapElement!, {
            crs: ImageCRS,
            // Allow 1 level of over-zoom past native for inspecting fine detail.
            // (Tiles get upscaled by Leaflet, so this is "free" in terms of disk.)
            maxZoom: tileMaxZoom + 1,
            // minZoom is replaced with the computed fitZoom below — we don't
            // want users to zoom out further than "image fills viewport".
            minZoom: 0,
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
        // padding > 0 keeps shapes painted slightly past the viewport edge
        // so they don't pop in/out at the boundary during pan.
        shapeRenderer = L.canvas({ padding: 0.5 });

        // fitZoom is the Leaflet zoom level at which the image fills the
        // viewport. We use this as both the initial view and the minimum zoom
        // so users can't zoom out into empty space around the image.
        const fitZoom = map.getBoundsZoom(bounds);

        // Set the initial view to the calculated fit zoom level
        map.setView([h / 2, w / 2], fitZoom, { animate: false });

        // Set this fitZoom as the absolute minimum zoom level allowed
        // This prevents the user from zooming out further than the image boundaries
        map.setMinZoom(fitZoom);

        // Seed viewport bounds before the first sync so the initial render
        // is also culled (otherwise we'd mount everything once, then cull on
        // the first user pan).
        recomputeVisibleBounds();

        // --- Attach Global Event Listeners ---
        attachContextMenuHandler(h);
        attachMouseMoveHandler(h);
        attachClickHandler(h);
        attachDrawingHandler();
        attachCleanupHandlers();
        attachViewportCullHandler();
    }

    /**
     * Recompute the visible image-pixel rectangle from the current map view.
     * The custom Y-down CRS makes lat == image Y (see initializeMap), so the
     * Leaflet bounds map directly to image coords. We pad by a tile width so
     * pins/shapes at the edge don't pop in/out during pan.
     */
    function recomputeVisibleBounds() {
        if (!map) return;
        const b = map.getBounds();
        const pad = 256;
        visibleBounds = {
            minX: b.getWest() - pad,
            maxX: b.getEast() + pad,
            minY: b.getSouth() - pad,
            maxY: b.getNorth() + pad,
        };
    }

    function attachViewportCullHandler() {
        const onViewChange = throttle(() => {
            if (!map || !mapConfig) return;
            recomputeVisibleBounds();
            syncPins(mapConfig);
            syncShapes(mapConfig);
        }, 100);
        map!.on("moveend zoomend", onViewChange);
    }

    // =========================================================================
    // GLOBAL EVENT HANDLERS (extracted from initializeMap for readability)
    // =========================================================================

    function attachContextMenuHandler(mapHeight: number) {
        map!.on("contextmenu", (e: L.LeafletMouseEvent) => {
            if (isDrawing) return; // Don't show context menu while drawing
            if (!mapConfig) return;

            const mapX = e.latlng.lng;
            const mapY = toMapY(e.latlng.lat, mapHeight); // Convert Leaflet LatLng to Map Coords (Y-flip)
            // Find all shapes under cursor using spatial index (fast) or fallback
            const shapesAtCursor = spatialIndex
                ? spatialIndex.query(
                      mapX,
                      mapY,
                      layerVisibilityLookup ?? mapConfig.layers,
                  )
                : getShapesAtPoint(
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
        // Core handler logic — extracted so it can be throttled
        const handleMouseMove = (e: L.LeafletMouseEvent) => {
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
            const mapY = toMapY(e.latlng.lat, mapHeight);
            // Use spatial index for fast lookup, fall back to linear scan
            const shapes = spatialIndex
                ? spatialIndex.query(
                      mapX,
                      mapY,
                      layerVisibilityLookup ?? mapConfig.layers,
                  )
                : getShapesAtPoint(
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
        };

        // Throttle to ~30ms to avoid running expensive hit-tests on every pixel
        const throttledHandler = throttle(handleMouseMove, 30);
        map!.on("mousemove", throttledHandler);
    }

    function attachClickHandler(mapHeight: number) {
        map!.on("click", (e: L.LeafletMouseEvent) => {
            if (!isDrawing) {
                if (!mapConfig) return;

                // Handle Click Disambiguation for Overlapping Regions
                // Note: This only runs if the click wasn't stopped by a Pin
                const mapX = e.latlng.lng;
                const mapY = toMapY(e.latlng.lat, mapHeight);

                // Find shapes with navigation targets using spatial index
                const allShapes = spatialIndex
                    ? spatialIndex.query(
                      mapX,
                      mapY,
                      layerVisibilityLookup ?? mapConfig.layers,
                  )
                    : getShapesAtPoint(
                          mapX,
                          mapY,
                          mapConfig.shapes,
                          mapConfig.layers,
                      );
                const shapes = allShapes.filter(
                    (s) => s.targetPage || s.targetMap,
                );

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

    /**
     * Syncs Leaflet image layers with the current map config.
     *
     * Three states per layer:
     *  - **Cached** (`tileInfo` in store): mount the tiled `GridLayer`.
     *  - **Miss confirmed** (`cacheMisses` has the key): mount the fallback
     *    `ImageOverlay` and kick off generation. The store update on
     *    completion swaps us up to a `GridLayer`.
     *  - **Unknown**: kick off a read-only lookup and mount nothing yet.
     *    The lookup either populates `tileInfoStore` (hit) or
     *    `cacheMisses` (miss); either way the effect re-runs and we land
     *    in one of the two states above on the next pass.
     *
     * The third state is what avoids loading the full-resolution source
     * on cache hits — without it, every cold map open mounts the giant
     * original image while the (typically instant) cache check completes.
     */
    function syncImageLayers(config: MapConfig) {
        const bounds: L.LatLngBoundsExpression = [
            [0, 0],
            [config.height, config.width],
        ];
        const tileMap = $tileInfoStore;
        const currentLayerIds = new Set<string>();

        for (const layer of config.layers) {
            currentLayerIds.add(layer.id);

            // Hidden layer — drop any overlay we may have for it.
            if (!layer.visible) {
                imageOverlays.get(layer.id)?.remove();
                imageOverlays.delete(layer.id);
                continue;
            }

            const imagePath = $imagePathLookup.get(layer.image.toLowerCase());
            if (!imagePath) continue;

            const key = layer.image.toLowerCase();
            const tileInfo = tileMap.get(key);
            const isMiss = cacheMisses.has(key);
            const existing = imageOverlays.get(layer.id);

            // State: unknown — kick off the cheap read-only lookup and
            // don't mount anything yet. The effect will re-run when the
            // result lands in tileInfoStore (hit) or cacheMisses (miss).
            if (!tileInfo && !isMiss) {
                if (!lookupsInFlight.has(key)) {
                    lookupsInFlight.add(key);
                    lookupTileInfo(layer.image)
                        .then((info) => {
                            if (!info && !destroyed) {
                                cacheMisses = new Set(cacheMisses).add(key);
                            }
                        })
                        .finally(() => lookupsInFlight.delete(key));
                }
                existing?.remove();
                imageOverlays.delete(layer.id);
                continue;
            }

            const needsTile = !!tileInfo;
            const hasTile = existing && !(existing instanceof L.ImageOverlay);

            // Right type already mounted — patch in place.
            if (existing && needsTile === hasTile) {
                existing.setOpacity(layer.opacity);
                (existing as L.GridLayer).setZIndex(layer.zIndex);
                continue;
            }

            // Otherwise replace.
            existing?.remove();
            const fresh: L.ImageOverlay | L.GridLayer = tileInfo
                ? createTileLayer(tileInfo, bounds, layer.opacity, layer.zIndex)
                : L.imageOverlay(convertFileSrc(imagePath), bounds, {
                      opacity: layer.opacity,
                      zIndex: layer.zIndex,
                  });
            fresh.addTo(map!);
            imageOverlays.set(layer.id, fresh);

            // Cache miss path: kick off generation. The tileInfoStore
            // update on completion will swap us up to a GridLayer.
            if (!tileInfo) getLayerTileInfo(layer.image);
        }

        // Remove overlays for layers that were deleted from the config.
        for (const [id, overlay] of imageOverlays) {
            if (!currentLayerIds.has(id)) {
                overlay.remove();
                imageOverlays.delete(id);
            }
        }
    }

    /**
     * Creates a Leaflet GridLayer that serves tiles from the on-disk pyramid
     * generated by the Rust tiler.
     *
     * The custom GridLayer class is hoisted to module scope (see
     * `TileGridLayer` near the top of this script) — we don't redefine it
     * per call. We pass `tileDir` through `options` so each instance knows
     * where to fetch its tiles from.
     */
    function createTileLayer(
        tileInfo: TileSetInfo,
        bounds: L.LatLngBoundsExpression,
        opacity: number,
        zIndex: number,
    ): L.GridLayer {
        return new (TileGridLayer as any)({
            tileDir: tileInfo.tile_dir,
            tileExt: tileInfo.tile_ext,
            bounds,
            // Native zoom range = the actual tile files on disk.
            // Leaflet will request tiles at these zoom levels and scale them
            // for any over-zoom (between maxNativeZoom and maxZoom).
            minNativeZoom: 0,
            maxNativeZoom: tileInfo.max_zoom,
            minZoom: 0,
            maxZoom: tileInfo.max_zoom + 1,
            tileSize: TILE_SIZE,
            noWrap: true,
            opacity,
            zIndex,
        });
    }

    // --- Update Pins (Diff-based) ---
    // Only adds/removes/updates markers that actually changed.
    function syncPins(config: MapConfig) {
        if (!markerLayerGroup || !map) return;

        const h = config.height;
        const newFingerprints = new Map<string, string>();
        const currentIds = new Set<string>();
        const vb = visibleBounds;
        // Build the visibility lookup once instead of paying an O(layers)
        // array scan per pin (matters when there are thousands of pins).
        const layerLookup = buildLayerVisibilityLookup(config.layers);

        config.pins.forEach((pin: MapPin) => {
            if (!isLayerIdVisible(layerLookup, pin.layerId)) return;

            // Viewport cull: pin off-screen → don't mount. We deliberately
            // skip adding it to currentIds so the trailing cleanup loop
            // unmounts any existing marker, and we leave it out of
            // newFingerprints so re-entering the viewport rebuilds fresh.
            if (
                vb &&
                (pin.x < vb.minX ||
                    pin.x > vb.maxX ||
                    pin.y < vb.minY ||
                    pin.y > vb.maxY)
            ) {
                return;
            }

            currentIds.add(pin.id);
            const fp = pinFingerprint(pin);
            newFingerprints.set(pin.id, fp);

            const prevFp = prevPinFingerprints.get(pin.id);
            if (prevFp === fp && pinIdToLayer.has(pin.id)) {
                // Pin unchanged — skip
                return;
            }

            // Pin is new or changed — remove old marker if it exists
            const existingMarker = pinIdToLayer.get(pin.id);
            if (existingMarker) {
                markerLayerGroup!.removeLayer(existingMarker);
                pinIdToLayer.delete(pin.id);
            }

            // Create new marker
            const leafletLat = toLeafletLat(pin.y, h);
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

        // Remove markers for pins that no longer exist
        for (const [id, marker] of pinIdToLayer) {
            if (!currentIds.has(id)) {
                markerLayerGroup!.removeLayer(marker);
                pinIdToLayer.delete(id);
            }
        }

        prevPinFingerprints = newFingerprints;
    }

    // --- Update Regions (Shapes) — Diff-based ---
    //
    // Two distinct call paths:
    //   1. Data update (config edit): config.shapes is a fresh array. Per-shape
    //      fingerprint diff so we only rebuild Leaflet layers whose data
    //      actually changed.
    //   2. Viewport update (pan/zoom): config.shapes is identical. Skip the
    //      fingerprint pass entirely — diff by membership only and just mount
    //      newly-in-view shapes / unmount outgoing ones. Big win for region-
    //      heavy maps where stringifying every polygon's points costs more
    //      than the rest of the pan combined.
    function syncShapes(config: MapConfig) {
        if (!shapeLayerGroup) return;

        const shapesChanged = spatialIndexShapes !== config.shapes;

        // Rebuild the spatial index only when the shapes array identity
        // changes. Pan/zoom reuses the existing index.
        if (!spatialIndex || shapesChanged) {
            spatialIndex = new ShapeSpatialIndex(
                config.shapes,
                config.width,
                config.height,
            );
            spatialIndexShapes = config.shapes;
        }

        // Build the visibility lookup once and reuse for both the early-out
        // scan and the per-candidate filter below.
        const layerLookup = buildLayerVisibilityLookup(config.layers);

        // Early-out: no shape sits on a visible layer. Common when the user
        // hasn't enabled region layers yet — saves the queryBounds pass and
        // all the per-shape work below.
        const anyVisibleShape = config.shapes.some((s) =>
            isLayerIdVisible(layerLookup, s.layerId),
        );
        if (!anyVisibleShape) {
            for (const [, layer] of shapeIdToLayer) {
                shapeLayerGroup.removeLayer(layer);
            }
            shapeIdToLayer.clear();
            prevShapeFingerprints.clear();
            return;
        }

        const h = config.height;
        const vb = visibleBounds;
        const candidateShapes = vb
            ? spatialIndex.queryBounds(vb.minX, vb.minY, vb.maxX, vb.maxY)
            : config.shapes;

        const currentIds = new Set<string>();
        const newFingerprints = shapesChanged
            ? new Map<string, string>()
            : null;

        candidateShapes.forEach((shape: MapRegion) => {
            if (!isLayerIdVisible(layerLookup, shape.layerId)) return;

            currentIds.add(shape.id);

            if (newFingerprints) {
                // Data-update path — fingerprint diff
                const fp = shapeFingerprint(shape);
                newFingerprints.set(shape.id, fp);
                const prevFp = prevShapeFingerprints.get(shape.id);
                if (prevFp === fp && shapeIdToLayer.has(shape.id)) return;
            } else {
                // Viewport-only path — membership diff. Already mounted = done.
                if (shapeIdToLayer.has(shape.id)) return;
            }

            // Need to (re)create. Remove any stale layer first.
            const existingLayer = shapeIdToLayer.get(shape.id);
            if (existingLayer) {
                shapeLayerGroup!.removeLayer(existingLayer);
                shapeIdToLayer.delete(shape.id);
            }

            const color = shape.color || DEFAULT_SHAPE_COLOR;
            const initialStyle: L.PathOptions = {
                color: color,
                fillColor: color,
                ...REGION_STYLES.hidden,
                renderer: shapeRenderer ?? undefined,
            };

            let layer: L.Path;
            if (shape.type === "polygon") {
                const latLngs = shape.points.map(
                    (p) => [toLeafletLat(p.y, h), p.x] as [number, number],
                );
                layer = L.polygon(latLngs, initialStyle);
            } else {
                return;
            }

            layer.addTo(shapeLayerGroup!);
            shapeIdToLayer.set(shape.id, layer);
        });

        // Unmount shapes no longer in the visible set (off-screen or removed).
        for (const [id, layer] of shapeIdToLayer) {
            if (!currentIds.has(id)) {
                shapeLayerGroup!.removeLayer(layer);
                shapeIdToLayer.delete(id);
            }
        }

        if (newFingerprints) {
            prevShapeFingerprints = newFingerprints;
        }
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
                y: Math.round(toMapY(p.lat, h)),
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

{#if $areLinkPreviewsEnabled}
    <LinkPreview
        anchorEl={hoveredElement}
        targetPath={hoveredPath}
        preferredSide={linkPreviewSideBias}
        positionToken={previewAnchorVersion}
    />
{/if}
{#if $areMapPreviewsEnabled}
    <MapPreview
        anchorEl={hoveredMapElement}
        targetPath={hoveredMapPath}
        preferredSide={mapPreviewSideBias}
        positionToken={previewAnchorVersion}
    />
{/if}

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
            <!--
              Invisible 1×1 anchor positioned over the currently-hovered
              canvas-rendered shape. Hover-driven previews (LinkPreview,
              MapPreview) read its bounding rect to position themselves
              alongside the target — replacing the old per-shape
              `getElement()` anchor that the canvas renderer doesn't
              provide.
            -->
            <div
                bind:this={previewAnchor}
                class="preview-anchor"
                aria-hidden="true"
            ></div>

            {#if isDrawing}
                <div class="map-drawing-hint tooltip-floating">
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

            {#if tilesLoading}
                <div class="tile-loading-overlay floating-panel">
                    {#each Object.entries(tileProgress) as [image, progress] (image)}
                        <ProgressBar
                            value={progress.current}
                            max={progress.total}
                            label={progress.phase === "loading"
                                ? "Decoding image…"
                                : "Generating tiles…"}
                            detail="{progress.current}/{progress.total} zoom levels"
                        />
                    {/each}
                </div>
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
        gap: var(--space-md);
    }
    .error-container,
    .status-container {
        padding: var(--space-lg);
        display: flex;
        justify-content: center;
        align-items: center;
        color: var(--color-text-secondary);
        font-style: italic;
    }
    .map-wrapper {
        flex-grow: 1;
        position: relative;
        background-color: var(--color-canvas-bg);
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

    /* 1×1 anchor moved by the hover effects — invisible and click-through,
       but its bounding rect is what LinkPreview / MapPreview position
       against when a canvas-rendered shape is hovered. */
    .preview-anchor {
        position: absolute;
        width: 1px;
        height: 1px;
        pointer-events: none;
        opacity: 0;
        z-index: 1;
    }

    /* Floating Hint Overlay
       Inherits surface (background, border, shadow, blur, font-size) from
       .tooltip-floating in app.css. Only positional/layout-specific styles
       live here. */
    .map-drawing-hint {
        position: absolute;
        top: var(--space-md);
        left: 50%;
        transform: translateX(-50%);
        padding: var(--space-sm) var(--space-md);
        border-radius: 999px; /* Pill shape — overrides utility's radius */
        pointer-events: none;
        z-index: 2000; /* Above everything including markers/popups */
        font-weight: 500;
        white-space: nowrap;
    }

    /* Tile generation progress overlay.
       Inherits background/border/shadow/radius from .floating-panel in app.css. */
    .tile-loading-overlay {
        position: absolute;
        bottom: var(--space-md);
        left: 50%;
        transform: translateX(-50%);
        padding: var(--space-md);
        z-index: 1000;
        min-width: 220px;
        max-width: 320px;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
    }

    /* Pin marker base style.
     * drop-shadow and transitions moved to :hover / .highlighted only
     * to avoid GPU layer promotion for every marker (thousands of composited layers).
     * will-change removed — it hurts when applied to thousands of elements.
     */
    :global(.custom-pin-marker) {
        background: transparent;
        border: none;
    }

    :global(.custom-pin-marker:hover) {
        filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3));
        transition: transform 0.2s;
    }

    :global(.custom-pin-marker.highlighted) {
        z-index: 1000 !important;
        filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
        transition: transform 0.2s;
    }

    /* GHOST PIN STYLES
       Default: Opacity 0 (Invisible but clickable)
       Console Open: Opacity 0.6 (Visible "Ghost")
    */
    :global(.ghost-pin-marker) {
        background: transparent;
        border: none;
        opacity: 0; /* Totally invisible by default */
        transition: opacity 0.3s ease;
        /* Ensure it captures clicks even when invisible */
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

    /* Multi-region tooltip — Leaflet creates this DOM, so we can't apply
       the .tooltip-floating utility class via the template. Pull the same
       theme tokens directly so the tooltip stays consistent with .map-drawing-hint
       and themes uniformly.
       The font-size and padding come from this rule, not the utility, because
       Leaflet's default tooltip styles are more specific. */
    :global(.multi-region-tooltip) {
        background-color: var(--color-tooltip-bg);
        color: var(--color-tooltip-text);
        border: 1px solid var(--color-tooltip-border);
        border-radius: var(--radius-base);
        font-size: 0.9rem;
        padding: var(--space-sm);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(4px);
    }
    /* Match the tooltip arrow tip to the new background color. */
    :global(.multi-region-tooltip.leaflet-tooltip-top:before) {
        border-top-color: var(--color-tooltip-bg);
    }

    /* Theme overrides for Leaflet controls */
    :global(.leaflet-bar) {
        border: 2px solid var(--color-border-primary) !important;
        border-radius: var(--radius-base) !important;
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
