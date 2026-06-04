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
    } from "$lib/canvasStore";
    import {
        screenToWorld,
        zoomAbout,
        rectFromCorners,
        marqueeHitTest,
        type Viewport,
        type Point,
    } from "$lib/canvasViewport";
    import { createHistory } from "$lib/canvasHistory";
    import * as M from "$lib/canvasMutations";
    import { normalizePath } from "$lib/utils";
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
    let containerEl = $state<HTMLDivElement | null>(null);
    let marquee = $state<{ start: Point; current: Point } | null>(null);

    const history = createHistory<CanvasData>(100);

    // Reactive view of this canvas's data from the store cache.
    const canvas = $derived<CanvasData>(
        $loadedCanvases.get(path)?.data ?? emptyCanvas(),
    );

    // Load on mount / when the path changes.
    $effect(() => {
        const p = path;
        if (!p) return;
        if (!getCanvasFromCache(p)) loadCanvasData(p);
    });

    function containerPoint(e: PointerEvent | WheelEvent): Point {
        const r = containerEl!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    /** Apply a mutation with an undo snapshot of the pre-change state. */
    function mutate(fn: (d: CanvasData) => CanvasData) {
        const before = getCanvasFromCache(path) ?? emptyCanvas();
        history.push(before);
        updateCanvas(path, fn);
    }

    function undo() {
        const cur = getCanvasFromCache(path) ?? emptyCanvas();
        const prev = history.undo(cur);
        if (prev) updateCanvas(path, () => prev);
    }
    function redo() {
        const cur = getCanvasFromCache(path) ?? emptyCanvas();
        const next = history.redo(cur);
        if (next) updateCanvas(path, () => next);
    }

    // Gesture model for drag/resize: snapshot once at start, preview live in the
    // cache (no history, no disk write), commit one history entry + one write at end.
    let gesturePre: CanvasData | null = null;

    function beginGesture() {
        gesturePre = getCanvasFromCache(path) ?? emptyCanvas();
    }
    function previewMutate(fn: (d: CanvasData) => CanvasData) {
        const cur = getCanvasFromCache(path) ?? emptyCanvas();
        registerCanvas(path, fn(cur)); // cache + reactive store only
    }
    function endGesture() {
        const before = gesturePre;
        gesturePre = null;
        if (!before) return;
        const current = getCanvasFromCache(path);
        if (!current || JSON.stringify(current) === JSON.stringify(before)) return;
        history.push(before);
        updateCanvas(path, () => current); // single disk write
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
        containerEl!.setPointerCapture(e.pointerId);
        const sp = containerPoint(e);
        const world = screenToWorld(sp.x, sp.y, viewport);
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

    function onWheel(e: WheelEvent) {
        e.preventDefault();
        const sp = containerPoint(e);
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
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
        } else if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
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
            x: Math.round(at.x - 90),
            y: Math.round(at.y - 40),
            width: 180,
            height: 80,
            text: "",
        };
        mutate((d) => M.addNode(d, node));
        selection = new Set([id]);
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
                title: "Add image",
                options: get(allImageFiles),
                onClose: closeModal,
                onSelect: (filename: string) => {
                    const abs = get(imagePathLookup).get(filename.toLowerCase());
                    const root = get(vaultPath);
                    if (abs && root)
                        createFileCard(at, toRelativePath(abs, root), 200, 150);
                },
            },
        });
    }

    function openEmbedPicker(at: Point) {
        openModal({
            component: CanvasPickerModal,
            props: {
                title: "Embed a note",
                options: get(allFileTitles),
                onClose: closeModal,
                onSelect: (titleStr: string) => {
                    const abs = get(pagePathLookup).get(titleStr.toLowerCase());
                    const root = get(vaultPath);
                    if (abs && root)
                        createFileCard(at, toRelativePath(abs, root), 240, 150);
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
                title: "Edge label",
                label: "Label for this connection:",
                initialValue: current,
                buttonText: "Save",
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
        registerCanvas(path, M.moveNodes(base, ids, Math.round(dx), Math.round(dy)));
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
    <CanvasToolbar bind:tool onUndo={undo} onRedo={redo} />
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
        class="canvas-viewport"
        bind:this={containerEl}
        role="application"
        tabindex="0"
        onpointerdown={onBackgroundPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onwheel={onWheel}
    >
        <div
            class="canvas-world"
            style="transform: translate({viewport.panX}px, {viewport.panY}px) scale({viewport.zoom});"
        >
            <CanvasEdges {canvas} {selectedEdgeId} {onEdgeSelect} {onEdgeLabel} />
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
                    {path}
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
        <div class="zoom-control">
            <button
                onclick={() => {
                    const c = containerEl!.getBoundingClientRect();
                    viewport = zoomAbout(viewport, 1 / 1.2, c.width / 2, c.height / 2, ZOOM_MIN, ZOOM_MAX);
                }}>−</button
            >
            <span>{Math.round(viewport.zoom * 100)}%</span>
            <button
                onclick={() => {
                    const c = containerEl!.getBoundingClientRect();
                    viewport = zoomAbout(viewport, 1.2, c.width / 2, c.height / 2, ZOOM_MIN, ZOOM_MAX);
                }}>+</button
            >
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
        background-size: 26px 26px;
        cursor: grab;
        touch-action: none;
    }
    .canvas-world {
        position: absolute;
        top: 0;
        left: 0;
        transform-origin: 0 0;
        will-change: transform;
    }
    .marquee {
        position: absolute;
        background: color-mix(in srgb, var(--color-accent-primary) 18%, transparent);
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
    .zoom-control span {
        min-width: 42px;
        text-align: center;
        color: var(--color-text-secondary);
        font-size: 13px;
    }
</style>
