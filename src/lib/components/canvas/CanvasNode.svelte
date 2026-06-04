<script lang="ts">
    import type { CanvasData, CanvasNodeData } from "$lib/canvasModels";
    import type { Viewport } from "$lib/canvasViewport";
    import * as M from "$lib/canvasMutations";
    import { colorToCss, PRESET_COLORS } from "$lib/canvasColors";
    import CanvasTextCard from "./CanvasTextCard.svelte";
    import CanvasFileCard from "./CanvasFileCard.svelte";

    let {
        node,
        viewport,
        selected,
        onSelect,
        onMutate,
        onGestureStart,
        onGesturePreview,
        onGestureEnd,
        onDragMove,
        path,
        tool,
        connectSource = null,
        onConnectClick,
    } = $props<{
        node: CanvasNodeData;
        viewport: Viewport;
        selected: boolean;
        onSelect: (additive: boolean) => void;
        onMutate: (fn: (d: CanvasData) => CanvasData) => void;
        onGestureStart: () => void;
        onGesturePreview: (fn: (d: CanvasData) => CanvasData) => void;
        onGestureEnd: () => void;
        onDragMove: (id: string, dx: number, dy: number) => void;
        path: string;
        tool: "select" | "text" | "image" | "embed" | "connect";
        connectSource?: string | null;
        onConnectClick: (id: string) => void;
    }>();

    let editing = $state(false);
    let showPalette = $state(false);
    const accent = $derived(colorToCss(node.color));

    function setColor(c: string | undefined) {
        onMutate((d: CanvasData) => M.patchNode(d, node.id, { color: c }));
        showPalette = false;
    }

    // --- Drag to move ---
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origX = 0;
    let origY = 0;

    function onPointerDown(e: PointerEvent) {
        if (editing) return;
        // Right-click is reserved for the color palette (oncontextmenu); don't
        // let it start a drag/select or register a connection.
        if (e.button === 2) return;
        if (tool === "connect") {
            e.stopPropagation();
            onConnectClick(node.id);
            return;
        }
        showPalette = false;
        e.stopPropagation();
        onSelect(e.shiftKey);
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        origX = node.x;
        origY = node.y;
        onGestureStart();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    function onPointerMove(e: PointerEvent) {
        if (!dragging) return;
        const dx = (e.clientX - startX) / viewport.zoom;
        const dy = (e.clientY - startY) / viewport.zoom;
        onDragMove(node.id, dx, dy);
    }
    function onPointerUp(e: PointerEvent) {
        dragging = false;
        onGestureEnd();
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            /* noop */
        }
    }

    // --- Resize (bottom-right handle) ---
    let resizing = false;
    function onResizeDown(e: PointerEvent) {
        e.stopPropagation();
        resizing = true;
        startX = e.clientX;
        startY = e.clientY;
        origX = node.width;
        origY = node.height;
        onGestureStart();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    function onResizeMove(e: PointerEvent) {
        if (!resizing) return;
        const dw = (e.clientX - startX) / viewport.zoom;
        const dh = (e.clientY - startY) / viewport.zoom;
        onGesturePreview((d: CanvasData) =>
            M.patchNode(d, node.id, {
                width: Math.max(60, Math.round(origX + dw)),
                height: Math.max(40, Math.round(origY + dh)),
            }),
        );
    }
    function onResizeUp() {
        resizing = false;
        onGestureEnd();
    }
</script>

<div
    class="canvas-node"
    class:selected
    class:connect-source={connectSource === node.id}
    style="left:{node.x}px;top:{node.y}px;width:{node.width}px;height:{node.height}px;"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    oncontextmenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        showPalette = true;
    }}
    ondblclick={() => {
        if (node.type === "text") editing = true;
    }}
    role="button"
    tabindex="-1"
>
    {#if accent}
        <div class="color-bar" style="background:{accent}"></div>
    {/if}

    {#if node.type === "text"}
        <CanvasTextCard {node} {editing} {path} {onMutate}
            onDoneEditing={() => (editing = false)} />
    {:else if node.type === "file"}
        <CanvasFileCard {node} />
    {/if}

    {#if selected && !editing}
        <div
            class="resize-handle"
            onpointerdown={onResizeDown}
            onpointermove={onResizeMove}
            onpointerup={onResizeUp}
            role="button"
            tabindex="-1"
        ></div>
    {/if}

    {#if showPalette}
        <div class="palette" onpointerdown={(e) => e.stopPropagation()} role="menu">
            {#each Object.entries(PRESET_COLORS) as [id, css]}
                <button
                    class="swatch"
                    style="background:{css}"
                    aria-label={`Color ${id}`}
                    onclick={() => setColor(id)}
                ></button>
            {/each}
            <button
                class="swatch none"
                aria-label="No color"
                onclick={() => setColor(undefined)}>⌀</button
            >
        </div>
    {/if}
</div>

<style>
    .canvas-node {
        position: absolute;
        box-sizing: border-box;
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: 10px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
        overflow: hidden;
        cursor: grab;
    }
    .canvas-node.selected {
        border-color: var(--color-accent-primary);
        box-shadow:
            0 0 0 2px var(--color-accent-primary),
            0 6px 18px rgba(0, 0, 0, 0.3);
    }
    .canvas-node.connect-source {
        outline: 2px dashed var(--color-accent-primary);
        outline-offset: 2px;
    }
    .color-bar {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
    }
    .palette {
        position: absolute;
        top: 4px;
        right: 4px;
        display: flex;
        gap: 3px;
        padding: 4px;
        background: var(--color-background-tertiary);
        border: 1px solid var(--color-border-primary);
        border-radius: 8px;
        z-index: 2;
    }
    .swatch {
        width: 18px;
        height: 18px;
        border: 1px solid var(--color-border-primary);
        border-radius: 4px;
        cursor: pointer;
        padding: 0;
        font-size: 11px;
        color: var(--color-text-secondary);
    }
    .swatch.none {
        background: var(--color-background-primary);
    }
    .resize-handle {
        position: absolute;
        right: -5px;
        bottom: -5px;
        width: 12px;
        height: 12px;
        background: var(--color-accent-primary);
        border: 1.5px solid var(--color-background-primary);
        border-radius: 3px;
        cursor: nwse-resize;
    }
</style>
