<script lang="ts">
    import type {
        CanvasData,
        CanvasNodeData,
        CanvasTool,
    } from "$lib/canvasModels";
    import type { Viewport } from "$lib/canvasViewport";
    import * as M from "$lib/canvasMutations";
    import { isImageFile } from "$lib/utils";
    import { colorToCss, PRESET_COLORS } from "$lib/canvasColors";
    import {
        hasMoreBelow,
        hasMoreRight,
        observeSize,
        overflowsVertically,
    } from "$lib/domActions";
    import { wheelPixels } from "$lib/canvasViewport";
    import CanvasTextCard from "./CanvasTextCard.svelte";
    import CanvasFileCard from "./CanvasFileCard.svelte";
    import { t } from "$lib/i18n";

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
        tool,
        connectSource = null,
        onConnectClick,
        autoEdit = false,
        onAutoEditConsumed,
        fitOnReady = false,
        onAutoFit,
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
        tool: CanvasTool;
        connectSource?: string | null;
        onConnectClick: (id: string) => void;
        autoEdit?: boolean;
        onAutoEditConsumed?: () => void;
        /** Size the card to its content once it has loaded (fresh page
         *  cards). The card stays hidden until then. */
        fitOnReady?: boolean;
        /** Resize to fit content as part of the change that produced it — no
         *  undo step of its own. */
        onAutoFit?: (height: number) => void;
    }>();

    let editing = $state(false);
    let showPalette = $state(false);
    let el = $state<HTMLDivElement | null>(null);
    let paletteEl = $state<HTMLDivElement | null>(null);

    // Any press outside the palette, or Escape, dismisses it.
    $effect(() => {
        if (!showPalette) return;
        const onDown = (e: PointerEvent) => {
            if (!paletteEl?.contains(e.target as Node)) showPalette = false;
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") showPalette = false;
        };
        window.addEventListener("pointerdown", onDown, true);
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.removeEventListener("pointerdown", onDown, true);
            window.removeEventListener("keydown", onKey, true);
        };
    });

    // Freshly created text cards open straight into edit mode.
    $effect(() => {
        if (autoEdit && node.type === "text" && !editing) {
            startEditing();
            onAutoEditConsumed?.();
        }
    });
    const accent = $derived(colorToCss(node.color));
    // Tinted border + subtle wash (Obsidian-style). Custom properties so the
    // .selected rule can still override the border with the accent ring.
    const colorStyle = $derived(
        accent
            ? `--node-accent:${accent};--node-bg:color-mix(in srgb, ${accent} 8%, var(--color-background-secondary));`
            : "",
    );

    function setColor(c: string | undefined) {
        onMutate((d: CanvasData) => M.patchNode(d, node.id, { color: c }));
        showPalette = false;
    }

    // Pointer origin of the active gesture. Drag and resize share it: the
    // resize handle stops propagation, so only one can be running.
    let startX = 0;
    let startY = 0;

    // --- Drag to move ---
    let dragging = false;

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
        e.stopPropagation();
        onSelect(e.shiftKey);
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
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

    // --- Fit to content ---
    const MIN_WIDTH = 60;
    const MIN_HEIGHT = 40;
    /** Automatic fits stop here so a long page doesn't produce a towering
     *  card. An explicit fit (double-clicking the resize handle) doesn't. */
    const AUTO_FIT_MAX_HEIGHT = 900;

    /**
     * World-unit height the card needs to show all of its content, or null
     * when it can't be measured (a hidden tab lays out at 0x0). Measured as a
     * ratio against the current height: both rects include the viewport's
     * zoom, whatever mix of CSS zoom and transform produces it, and the ratio
     * cancels it out.
     */
    function contentHeight(): number | null {
        if (!el) return null;
        const shown = el.getBoundingClientRect().height;
        if (shown <= 0) return null;
        const prev = el.style.height;
        el.style.height = "auto";
        const natural = el.getBoundingClientRect().height;
        el.style.height = prev;
        return Math.max(MIN_HEIGHT, Math.ceil((node.height * natural) / shown));
    }

    /** contentHeight(), capped for an automatic fit. */
    function autoFitHeight(): number | null {
        const h = contentHeight();
        return h === null ? null : Math.min(h, AUTO_FIT_MAX_HEIGHT);
    }

    function onFileContentReady() {
        updateClipHints();
        if (!fitOnReady) return;
        // Always answer, even unmeasured: the answer is what reveals the card.
        onAutoFit?.(autoFitHeight() ?? node.height);
    }

    // Whether the text was already cut off when editing began. Then the card
    // was sized small on purpose, and an edit shouldn't undo that.
    let clippedBeforeEdit = false;
    function startEditing() {
        const body = el?.querySelector(".card-scroll");
        clippedBeforeEdit = !!body && overflowsVertically(body);
        editing = true;
    }

    /** After an edit, grow (never shrink) so the new text isn't cut off —
     *  unless it was cut off before the edit too. */
    function onTextRendered(afterEdit: boolean) {
        updateClipHints();
        if (!afterEdit || clippedBeforeEdit) return;
        const h = autoFitHeight();
        if (h !== null && h > node.height) onAutoFit?.(h);
    }

    // --- Scrolling the card body ---
    // Card bodies (`.card-scroll`) are `overflow: hidden`, not native
    // scrollers: WebKit gives a scroller its own layer, rasterizes it at 1x
    // and stretches it when the canvas is zoomed in, which blurs the whole
    // card. So a selected card scrolls its body here — down, or sideways
    // with a horizontal wheel or Shift, for wide tables and code — and the
    // wheel only reaches the canvas when there is nowhere left to scroll.
    // Once a wheel gesture is scrolling the card, the rest of it stays here
    // even after the body hits the end, or a flick's tail would zoom.
    const WHEEL_LATCH_MS = 250;
    let wheelLatchUntil = 0;
    function onWheel(e: WheelEvent) {
        if (!selected || e.ctrlKey || e.metaKey) return;
        const body = (e.target as HTMLElement).closest<HTMLElement>(
            ".card-scroll",
        );
        if (!body) return;
        // Deltas are screen px; a page is the body's height (or width).
        const zoom = viewport.zoom;
        let dx = wheelPixels(e.deltaX, e.deltaMode, body.clientWidth * zoom);
        let dy = wheelPixels(e.deltaY, e.deltaMode, body.clientHeight * zoom);
        if (e.shiftKey) {
            // Shift turns the wheel sideways, as it does for the canvas.
            dx = dx || dy;
            dy = 0;
        }
        const canScroll =
            (dx < 0 && body.scrollLeft > 0) ||
            (dx > 0 && hasMoreRight(body)) ||
            (dy < 0 && body.scrollTop > 0) ||
            (dy > 0 && hasMoreBelow(body));
        if (!canScroll && (e.timeStamp >= wheelLatchUntil || !(dx || dy))) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        // Screen px → the card's own px, so content tracks the wheel.
        body.scrollLeft += dx / zoom;
        body.scrollTop += dy / zoom;
        wheelLatchUntil = e.timeStamp + WHEEL_LATCH_MS;
    }

    // With no scrollbars to say there's more, fades do.
    let moreBelow = $state(false);
    let moreRight = $state(false);
    function updateClipHints() {
        const body = el?.querySelector(".card-scroll");
        moreBelow = !!body && hasMoreBelow(body);
        moreRight = !!body && hasMoreRight(body);
    }
    $effect(() => {
        if (!el) return;
        return observeSize(el, updateClipHints);
    });

    function onResizeDblClick(e: MouseEvent) {
        // The node's own dblclick would enter text editing.
        e.stopPropagation();
        const height = contentHeight();
        if (height === null || height === node.height) return;
        onMutate((d: CanvasData) => M.patchNode(d, node.id, { height }));
    }

    // --- Resize (bottom-right handle) ---
    let resizing = false;
    let origW = 0;
    let origH = 0;
    let lockAspect = false;
    function onResizeDown(e: PointerEvent) {
        if (e.button !== 0) return;
        e.stopPropagation();
        resizing = true;
        startX = e.clientX;
        startY = e.clientY;
        origW = node.width;
        origH = node.height;
        // Image cards keep their aspect ratio while resizing.
        lockAspect =
            node.type === "file" &&
            isImageFile(node.file) &&
            origW > 0 &&
            origH > 0;
        onGestureStart();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    function onResizeMove(e: PointerEvent) {
        if (!resizing) return;
        const dw = (e.clientX - startX) / viewport.zoom;
        const dh = (e.clientY - startY) / viewport.zoom;
        const width = Math.max(MIN_WIDTH, Math.round(origW + dw));
        const height = lockAspect
            ? Math.max(MIN_HEIGHT, Math.round((width * origH) / origW))
            : Math.max(MIN_HEIGHT, Math.round(origH + dh));
        onGesturePreview((d: CanvasData) =>
            M.patchNode(d, node.id, { width, height }),
        );
    }
    function onResizeUp() {
        resizing = false;
        onGestureEnd();
    }
</script>

<div
    bind:this={el}
    class="canvas-node"
    data-node-id={node.id}
    class:selected
    class:fitting={fitOnReady}
    class:connect-source={connectSource === node.id}
    style="left:{node.x}px;top:{node.y}px;width:{node.width}px;height:{node.height}px;{colorStyle}"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onwheel={onWheel}
    onscrollcapture={updateClipHints}
    oninput={updateClipHints}
    ondragstart={(e) => e.preventDefault()}
    oncontextmenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        showPalette = true;
    }}
    ondblclick={() => {
        if (node.type === "text") startEditing();
    }}
    role="button"
    tabindex="-1"
>
    {#if node.type === "text"}
        <CanvasTextCard
            {node}
            {editing}
            {onMutate}
            onDoneEditing={() => (editing = false)}
            onRendered={onTextRendered}
        />
    {:else if node.type === "file"}
        <CanvasFileCard {node} onContentReady={onFileContentReady} />
    {/if}

    {#if moreBelow}
        <div class="more-below" aria-hidden="true"></div>
    {/if}
    {#if moreRight}
        <div class="more-right" aria-hidden="true"></div>
    {/if}

    {#if selected && !editing}
        <div
            class="resize-handle"
            title={$t("canvas.resizeHint")}
            onpointerdown={onResizeDown}
            onpointermove={onResizeMove}
            onpointerup={onResizeUp}
            onpointercancel={onResizeUp}
            ondblclick={onResizeDblClick}
            role="button"
            tabindex="-1"
        ></div>
    {/if}

    {#if showPalette}
        <!-- `group`, not `menu`: these are plain buttons, not menuitems, so a
             menu role would promise keyboard semantics the palette doesn't have. -->
        <div
            bind:this={paletteEl}
            class="palette"
            onpointerdown={(e) => e.stopPropagation()}
            role="group"
            aria-label={$t("canvas.colorPalette")}
        >
            {#each Object.entries(PRESET_COLORS) as [id, css]}
                <button
                    class="swatch"
                    style="background:{css}"
                    aria-label={$t("canvas.selectColor", { name: id })}
                    onclick={() => setColor(id)}
                ></button>
            {/each}
            <button
                class="swatch none"
                aria-label={$t("canvas.noColor")}
                onclick={() => setColor(undefined)}>⌀</button
            >
        </div>
    {/if}
</div>

<style>
    .canvas-node {
        position: absolute;
        box-sizing: border-box;
        background: var(--node-bg, var(--color-background-secondary));
        border: 1px solid var(--node-accent, var(--color-border-primary));
        border-radius: 10px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
        overflow: hidden;
        cursor: grab;
    }
    .canvas-node.selected {
        border-color: var(--color-accent-primary);
        box-shadow:
            0 0 0 2px var(--color-accent-primary),
            0 6px 18px rgba(0, 0, 0, 0.3);
    }
    /* Laid out (so it can be measured) but not shown until fitted. */
    .canvas-node.fitting {
        visibility: hidden;
    }
    .more-below,
    .more-right {
        position: absolute;
        right: 0;
        bottom: 0;
        pointer-events: none;
        --clip-shade: color-mix(
            in srgb,
            var(--color-text-primary) 16%,
            transparent
        );
    }
    .more-below {
        left: 0;
        height: 18px;
        background: linear-gradient(transparent, var(--clip-shade));
    }
    .more-right {
        top: 0;
        width: 18px;
        background: linear-gradient(to right, transparent, var(--clip-shade));
    }
    .canvas-node.connect-source {
        outline: 2px dashed var(--color-accent-primary);
        outline-offset: 2px;
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
