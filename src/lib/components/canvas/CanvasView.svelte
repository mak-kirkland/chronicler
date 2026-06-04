<script lang="ts">
    import type { PageHeader } from "$lib/bindings";
    import type { CanvasData, CanvasNodeData } from "$lib/canvasModels";
    import { emptyCanvas, genNodeId, toRelativePath } from "$lib/canvasModels";
    import {
        loadCanvasData,
        getCanvasFromCache,
        updateCanvas,
        loadedCanvases,
        registerCanvas,
        externalReloads,
    } from "$lib/canvasStore";
    import {
        screenToWorld,
        zoomAbout,
        rectFromCorners,
        marqueeHitTest,
        fitToContent,
        defaultImageCardSize,
        gridStep,
        type Viewport,
        type Point,
    } from "$lib/canvasViewport";
    import { createHistory } from "$lib/canvasHistory";
    import * as M from "$lib/canvasMutations";
    import { getImageSource } from "$lib/commands";
    import { detectImageDimensions } from "$lib/mapUtils";
    import { normalizePath } from "$lib/utils";
    import { log } from "$lib/logger";
    import { get } from "svelte/store";
    import { openModal, closeModal } from "$lib/modalStore";
    import {
        allImageFiles,
        imagePathLookup,
        allFileTitles,
        pagePathLookup,
        vaultPath,
    } from "$lib/worldStore";
    import CanvasNode from "./CanvasNode.svelte";
    import CanvasEdges from "./CanvasEdges.svelte";
    import CanvasToolbar from "./CanvasToolbar.svelte";
    import CanvasPickerModal from "./CanvasPickerModal.svelte";
    import TextInputModal from "$lib/components/modals/TextInputModal.svelte";
    import { t, translate } from "$lib/i18n";

    let { data, isActive = true } = $props<{
        data: PageHeader | null;
        isActive?: boolean;
    }>();

    const path = $derived(data ? normalizePath(data.path) : "");
    const ZOOM_MIN = 0.1;
    const ZOOM_MAX = 4;

    let viewport = $state<Viewport>({ panX: 0, panY: 0, zoom: 1 });
    let selection = $state<Set<string>>(new Set());
    let tool = $state<"select" | "text" | "image" | "embed" | "connect">(
        "select",
    );
    let connectSource = $state<string | null>(null);
    let selectedEdgeId = $state<string | null>(null);
    let autoEditId = $state<string | null>(null);
    let containerEl = $state<HTMLDivElement | null>(null);
    let marquee = $state<{ start: Point; current: Point } | null>(null);

    const history = createHistory<CanvasData>(100);
    // history is a plain closure, so mirror its state reactively for the toolbar.
    let canUndo = $state(false);
    let canRedo = $state(false);
    function syncHistory() {
        canUndo = history.canUndo();
        canRedo = history.canRedo();
    }

    // Reactive view of this canvas's data from the store cache.
    const canvas = $derived<CanvasData>(
        $loadedCanvases.get(path)?.data ?? emptyCanvas(),
    );

    // Dot-grid step in screen px — the grid tracks pan/zoom like a real surface.
    const grid = $derived(gridStep(viewport.zoom));

    // Render pan snapped to whole pixels: fractional translation puts text on
    // subpixel boundaries and blurs it. State keeps full precision.
    const panXr = $derived(Math.round(viewport.panX));
    const panYr = $derived(Math.round(viewport.panY));

    // Reset per-file state when this instance is reused for a different canvas
    // (in-place navigation between two canvases reuses the same component, so
    // stale history could otherwise write file A's content into file B).
    let prevPath = "";
    $effect(() => {
        const p = path;
        if (p === prevPath) return;
        prevPath = p;
        history.clear();
        syncHistory();
        selection = new Set();
        selectedEdgeId = null;
        connectSource = null;
        autoEditId = null;
        gesturePre = null;
        marquee = null;
        panning = false;
        viewport = { panX: 0, panY: 0, zoom: 1 };
    });

    // Load whenever visible and not cached. Depending on $loadedCanvases (not
    // the raw cache) means an LRU eviction triggers a reload here instead of
    // the view silently collapsing to an empty canvas.
    $effect(() => {
        const p = path;
        if (!p || !isActive) return;
        if (!$loadedCanvases.has(p)) loadCanvasData(p);
    });

    // An external edit replaced the data; undoing across it would restore
    // a stale tree, so drop local history.
    let lastExternalReload = 0;
    $effect(() => {
        const n = $externalReloads.get(path) ?? 0;
        if (n !== lastExternalReload) {
            lastExternalReload = n;
            history.clear();
            syncHistory();
        }
    });

    // Once per file, when its data first arrives while visible, fit the view
    // to the content — nodes far from the origin would otherwise sit
    // off-screen and the canvas would open looking empty.
    let fittedPath = "";
    $effect(() => {
        const p = path;
        if (!p || !isActive || fittedPath === p) return;
        const entry = $loadedCanvases.get(p);
        if (!entry || !containerEl) return;
        const rect = containerEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        fittedPath = p;
        viewport = fitToContent(
            entry.data.nodes,
            rect.width,
            rect.height,
            60,
            ZOOM_MIN,
            1,
        );
    });

    // PointerEvent, WheelEvent, and dblclick's MouseEvent all qualify —
    // only clientX/clientY are used.
    function containerPoint(e: MouseEvent): Point {
        const r = containerEl!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    /**
     * Apply a mutation with an undo snapshot of the pre-change state. The
     * snapshot is taken inside the updater so it always reflects the true
     * current data (cache, or disk on a cache miss) — never an empty fallback.
     */
    function mutate(fn: (d: CanvasData) => CanvasData) {
        updateCanvas(path, (d) => {
            history.push(d);
            return fn(d);
        })
            .catch(() => {
                /* logged and rolled back in canvasStore */
            })
            .finally(syncHistory);
    }

    function undo() {
        if (!history.canUndo()) return;
        updateCanvas(path, (d) => history.undo(d) ?? d)
            .catch(() => {
                /* logged and rolled back in canvasStore */
            })
            .finally(syncHistory);
    }
    function redo() {
        if (!history.canRedo()) return;
        updateCanvas(path, (d) => history.redo(d) ?? d)
            .catch(() => {
                /* logged and rolled back in canvasStore */
            })
            .finally(syncHistory);
    }

    // Gesture model for drag/resize: snapshot once at start, preview live in the
    // cache (no history, no disk write), commit one history entry + one write at end.
    let gesturePre: CanvasData | null = null;

    function beginGesture() {
        // May be null if the cache entry was just evicted; the gesture then
        // no-ops instead of operating on (and committing) an empty canvas.
        gesturePre = getCanvasFromCache(path);
    }
    function previewMutate(fn: (d: CanvasData) => CanvasData) {
        const cur = getCanvasFromCache(path) ?? gesturePre;
        if (!cur) return;
        registerCanvas(path, fn(cur)); // cache + reactive store only
    }
    function endGesture() {
        const before = gesturePre;
        gesturePre = null;
        if (!before) return;
        const current = getCanvasFromCache(path);
        if (!current || JSON.stringify(current) === JSON.stringify(before))
            return;
        history.push(before);
        syncHistory();
        updateCanvas(path, () => current).catch(() => {
            /* single disk write; logged and rolled back in canvasStore */
        });
    }

    $effect(() => {
        if (tool !== "connect") connectSource = null;
    });

    // --- Pan & marquee on the background ---
    let panning = $state(false);
    let panStart: Point = { x: 0, y: 0 };
    let panOrigin: Viewport = { panX: 0, panY: 0, zoom: 1 };

    function onBackgroundPointerDown(e: PointerEvent) {
        if (e.target !== e.currentTarget) return; // only empty space
        // Left button creates/selects/pans, middle button always pans; right
        // and other buttons are left to the platform (context menu etc.).
        if (e.button !== 0 && e.button !== 1) return;
        containerEl!.setPointerCapture(e.pointerId);
        const sp = containerPoint(e);
        const world = screenToWorld(sp.x, sp.y, viewport);
        if (e.button === 0) {
            if (tool === "text") {
                createTextCard(world);
                tool = "select";
                return;
            }
            if (tool === "image") {
                openImagePicker(world);
                tool = "select";
                return;
            }
            if (tool === "embed") {
                openEmbedPicker(world);
                tool = "select";
                return;
            }
        }
        if (tool === "select" || e.button === 1) {
            // Shift starts a marquee; plain drag pans.
            if (e.shiftKey) {
                marquee = { start: world, current: world };
            } else {
                panning = true;
                panStart = sp;
                panOrigin = { ...viewport };
                selection = new Set();
            }
        }
    }

    function onPointerMove(e: PointerEvent) {
        const sp = containerPoint(e);
        if (panning) {
            viewport = {
                ...viewport,
                panX: panOrigin.panX + (sp.x - panStart.x),
                panY: panOrigin.panY + (sp.y - panStart.y),
            };
        } else if (marquee) {
            marquee = {
                ...marquee,
                current: screenToWorld(sp.x, sp.y, viewport),
            };
        }
    }

    function onPointerUp(e: PointerEvent) {
        if (marquee) {
            const rect = rectFromCorners(marquee.start, marquee.current);
            selection = new Set(marqueeHitTest(rect, canvas.nodes));
            marquee = null;
        }
        panning = false;
        try {
            containerEl?.releasePointerCapture(e.pointerId);
        } catch {
            /* not captured */
        }
    }

    function resetZoom() {
        const c = containerEl!.getBoundingClientRect();
        viewport = zoomAbout(
            viewport,
            1 / viewport.zoom,
            c.width / 2,
            c.height / 2,
            ZOOM_MIN,
            ZOOM_MAX,
        );
    }
    function zoomToFit() {
        const c = containerEl!.getBoundingClientRect();
        viewport = fitToContent(
            canvas.nodes,
            c.width,
            c.height,
            60,
            ZOOM_MIN,
            1,
        );
    }

    function onPointerCancel(e: PointerEvent) {
        // Interrupted gesture (OS stole the pointer): abandon the marquee/pan
        // rather than committing it.
        marquee = null;
        panning = false;
        try {
            containerEl?.releasePointerCapture(e.pointerId);
        } catch {
            /* not captured */
        }
    }

    function onWheel(e: WheelEvent) {
        e.preventDefault();
        // Line-mode deltas (some mice/configs) → approximate pixels.
        const scale = e.deltaMode === 1 ? 16 : 1;
        const dx = e.deltaX * scale;
        const dy = e.deltaY * scale;
        if (e.shiftKey) {
            // Horizontal pan; devices differ in which axis they report with
            // Shift held.
            viewport = { ...viewport, panX: viewport.panX - (dx || dy) };
            return;
        }
        // Wheel zooms about the cursor. Pinch gestures (which arrive as
        // ctrl+wheel with small deltas) get a delta-proportional factor for
        // smoothness; plain wheel notches zoom in fixed 1.1 steps.
        const sp = containerPoint(e);
        const factor =
            e.ctrlKey || e.metaKey
                ? Math.exp(-dy * 0.002)
                : dy < 0
                  ? 1.1
                  : 1 / 1.1;
        viewport = zoomAbout(viewport, factor, sp.x, sp.y, ZOOM_MIN, ZOOM_MAX);
    }

    function onKeyDown(e: KeyboardEvent) {
        const el = e.target as HTMLElement | null;
        if (
            el &&
            (el.isContentEditable ||
                el.closest(".cm-editor") ||
                el.tagName === "INPUT" ||
                el.tagName === "TEXTAREA")
        ) {
            return;
        }
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
            e.preventDefault();
            undo();
        } else if (
            mod &&
            (e.key.toLowerCase() === "y" ||
                (e.shiftKey && e.key.toLowerCase() === "z"))
        ) {
            e.preventDefault();
            redo();
        } else if (mod && e.key.toLowerCase() === "a") {
            e.preventDefault();
            selection = new Set(canvas.nodes.map((n) => n.id));
        } else if (e.key === "Delete" || e.key === "Backspace") {
            if (selection.size > 0) {
                e.preventDefault();
                const ids = [...selection];
                selection = new Set();
                mutate((d) => M.removeNodes(d, ids));
            } else if (selectedEdgeId) {
                e.preventDefault();
                const id = selectedEdgeId;
                selectedEdgeId = null;
                mutate((d) => M.removeEdges(d, [id]));
            }
        } else if (e.key === "Escape") {
            tool = "select";
            selection = new Set();
            connectSource = null;
            selectedEdgeId = null;
        }
    }

    // --- Card creation ---
    function createTextCard(at: Point) {
        const id = genNodeId();
        const node: CanvasNodeData = {
            id,
            type: "text",
            x: Math.round(at.x - 130),
            y: Math.round(at.y - 70),
            width: 260,
            height: 140,
            text: "",
        };
        mutate((d) => M.addNode(d, node));
        selection = new Set([id]);
        autoEditId = id;
    }

    function onBackgroundDblClick(e: MouseEvent) {
        if (e.target !== e.currentTarget) return; // only empty space
        const sp = containerPoint(e);
        createTextCard(screenToWorld(sp.x, sp.y, viewport));
    }

    function createFileCard(at: Point, relFile: string, w: number, h: number) {
        const id = genNodeId();
        mutate((d) =>
            M.addNode(d, {
                id,
                type: "file",
                x: Math.round(at.x - w / 2),
                y: Math.round(at.y - h / 2),
                width: w,
                height: h,
                file: relFile,
            }),
        );
        selection = new Set([id]);
    }

    function openImagePicker(at: Point) {
        openModal({
            component: CanvasPickerModal,
            props: {
                title: translate("canvas.addImage"),
                options: get(allImageFiles),
                onClose: closeModal,
                onSelect: async (filename: string) => {
                    const abs = get(imagePathLookup).get(
                        filename.toLowerCase(),
                    );
                    const root = get(vaultPath);
                    if (!abs || !root) return;
                    // Size the card to the image's natural aspect ratio.
                    let size = { width: 200, height: 150 };
                    try {
                        const src = await getImageSource(abs);
                        const dims = await detectImageDimensions(src);
                        size = defaultImageCardSize(dims.width, dims.height);
                    } catch (e) {
                        log.warn(
                            `Could not detect image dimensions: ${e}`,
                            "CanvasView",
                        );
                    }
                    createFileCard(
                        at,
                        toRelativePath(abs, root),
                        size.width,
                        size.height,
                    );
                },
            },
        });
    }

    function openEmbedPicker(at: Point) {
        openModal({
            component: CanvasPickerModal,
            props: {
                title: translate("canvas.embedNote"),
                options: get(allFileTitles),
                onClose: closeModal,
                onSelect: (titleStr: string) => {
                    const abs = get(pagePathLookup).get(titleStr.toLowerCase());
                    const root = get(vaultPath);
                    if (abs && root)
                        createFileCard(at, toRelativePath(abs, root), 340, 260);
                },
            },
        });
    }

    function onConnectClick(id: string) {
        if (connectSource === null) {
            connectSource = id;
        } else if (connectSource !== id) {
            const from = connectSource;
            connectSource = null;
            mutate((d) =>
                M.addEdge(d, { id: genNodeId(), fromNode: from, toNode: id }),
            );
        } else {
            connectSource = null;
        }
    }

    function onEdgeSelect(id: string) {
        selectedEdgeId = id;
        selection = new Set();
    }

    function onEdgeLabel(id: string) {
        const current = canvas.edges.find((e) => e.id === id)?.label ?? "";
        openModal({
            component: TextInputModal,
            props: {
                title: translate("canvas.edgeLabelTitle"),
                label: translate("canvas.edgeLabelPrompt"),
                initialValue: current,
                buttonText: translate("common.save"),
                onClose: closeModal,
                onSubmit: (label: string) => {
                    mutate((d) => M.patchEdge(d, id, { label }));
                    closeModal();
                },
            },
        });
    }

    function dragNodes(id: string, dx: number, dy: number) {
        const base = gesturePre;
        if (!base) return;
        const ids =
            selection.has(id) && selection.size > 1 ? [...selection] : [id];
        // Round the delta so node coordinates stay integers (matches resize and
        // keeps .canvas JSON diffs clean).
        registerCanvas(
            path,
            M.moveNodes(base, ids, Math.round(dx), Math.round(dy)),
        );
    }

    // Exposed to children
    function selectOnly(id: string, additive: boolean) {
        if (additive) {
            const next = new Set(selection);
            next.has(id) ? next.delete(id) : next.add(id);
            selection = next;
        } else if (!selection.has(id)) {
            selection = new Set([id]);
        }
    }
</script>

<svelte:window onkeydown={isActive ? onKeyDown : undefined} />

<div class="canvas-root">
    <CanvasToolbar bind:tool onUndo={undo} onRedo={redo} {canUndo} {canRedo} />
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
        class="canvas-viewport"
        class:grabbing={panning}
        bind:this={containerEl}
        role="application"
        tabindex="0"
        style="background-size: {grid}px {grid}px; background-position: {panXr}px {panYr}px;"
        onpointerdown={onBackgroundPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerCancel}
        ondblclick={onBackgroundDblClick}
        onwheel={onWheel}
    >
        <div
            class="canvas-world"
            class:panning
            style="transform: translate({panXr}px, {panYr}px) scale({viewport.zoom});"
        >
            <CanvasEdges
                {canvas}
                {selectedEdgeId}
                {onEdgeSelect}
                {onEdgeLabel}
            />
            {#each canvas.nodes as node (node.id)}
                <CanvasNode
                    {node}
                    {viewport}
                    {tool}
                    {connectSource}
                    {onConnectClick}
                    selected={selection.has(node.id)}
                    onSelect={(additive: boolean) =>
                        selectOnly(node.id, additive)}
                    onMutate={mutate}
                    onGestureStart={beginGesture}
                    onGesturePreview={previewMutate}
                    onGestureEnd={endGesture}
                    onDragMove={dragNodes}
                    autoEdit={autoEditId === node.id}
                    onAutoEditConsumed={() => (autoEditId = null)}
                />
            {/each}
            {#if marquee}
                {@const r = rectFromCorners(marquee.start, marquee.current)}
                <div
                    class="marquee"
                    style="left:{r.x}px;top:{r.y}px;width:{r.width}px;height:{r.height}px;"
                ></div>
            {/if}
        </div>
        {#if canvas.nodes.length === 0}
            <div class="empty-hint">{$t("canvas.emptyHint")}</div>
        {/if}
        <div class="zoom-control">
            <button
                title={$t("canvas.zoomOut")}
                aria-label={$t("canvas.zoomOut")}
                onclick={() => {
                    const c = containerEl!.getBoundingClientRect();
                    viewport = zoomAbout(
                        viewport,
                        1 / 1.2,
                        c.width / 2,
                        c.height / 2,
                        ZOOM_MIN,
                        ZOOM_MAX,
                    );
                }}>−</button
            >
            <button
                class="pct"
                title={$t("canvas.zoomReset")}
                aria-label={$t("canvas.zoomReset")}
                onclick={resetZoom}>{Math.round(viewport.zoom * 100)}%</button
            >
            <button
                title={$t("canvas.zoomIn")}
                aria-label={$t("canvas.zoomIn")}
                onclick={() => {
                    const c = containerEl!.getBoundingClientRect();
                    viewport = zoomAbout(
                        viewport,
                        1.2,
                        c.width / 2,
                        c.height / 2,
                        ZOOM_MIN,
                        ZOOM_MAX,
                    );
                }}>+</button
            >
            <button
                title={$t("canvas.zoomFit")}
                aria-label={$t("canvas.zoomFit")}
                onclick={zoomToFit}
            >
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="M6 2.5 H3.5 a1 1 0 0 0 -1 1 V6" />
                    <path d="M10 2.5 h2.5 a1 1 0 0 1 1 1 V6" />
                    <path d="M13.5 10 v2.5 a1 1 0 0 1 -1 1 H10" />
                    <path d="M2.5 10 v2.5 a1 1 0 0 0 1 1 H6" />
                </svg>
            </button>
        </div>
    </div>
</div>

<style>
    .canvas-root {
        position: relative;
        flex: 1;
        min-height: 0;
        display: flex;
    }
    .canvas-viewport {
        position: absolute;
        inset: 0;
        overflow: hidden;
        background-color: var(--color-background-primary);
        background-image: radial-gradient(
            circle,
            var(--color-border-primary) 1px,
            transparent 1px
        );
        cursor: grab;
        touch-action: none;
    }
    .canvas-viewport.grabbing {
        cursor: grabbing;
    }
    .canvas-world {
        position: absolute;
        top: 0;
        left: 0;
        transform-origin: 0 0;
    }
    /* Promote to a compositor layer only while panning (pure translation never
       blurs). At rest / after zoom the layer re-rasterizes at the current
       scale, keeping text crisp — a promoted layer would stay cached at 1x
       and stretch. */
    .canvas-world.panning {
        will-change: transform;
    }
    .empty-hint {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: var(--color-text-secondary);
        font-size: 14px;
        font-style: italic;
        pointer-events: none;
        user-select: none;
    }
    .marquee {
        position: absolute;
        background: color-mix(
            in srgb,
            var(--color-accent-primary) 18%,
            transparent
        );
        border: 1px solid var(--color-accent-primary);
        pointer-events: none;
    }
    .zoom-control {
        position: absolute;
        right: 12px;
        bottom: 12px;
        display: flex;
        align-items: center;
        gap: 4px;
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: 8px;
        padding: 4px 8px;
    }
    .zoom-control button {
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        color: var(--color-text-primary);
        cursor: pointer;
        font-size: 16px;
    }
    .zoom-control .pct {
        min-width: 42px;
        width: auto;
        text-align: center;
        color: var(--color-text-secondary);
        font-size: 13px;
    }
    .zoom-control button:hover {
        color: var(--color-text-primary);
    }
    .zoom-control svg {
        display: block;
        margin: 0 auto;
    }
</style>
