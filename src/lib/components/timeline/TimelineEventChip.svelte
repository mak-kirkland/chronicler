<script lang="ts">
    import {
        MIN_SPAN_PX,
        LABEL_PAD_PX,
        MIN_INSIDE_PX,
        type PlacedEvent,
    } from "$lib/timelineLayout";
    import type { TimelineViewportState } from "$lib/timelineModels";
    import { serialToX } from "$lib/timelineViewport";

    let {
        placed,
        viewport,
        widthPx,
        laneColor,
        selected = false,
        onSelect,
        onEdit,
        onOpenPage,
        onContextMenu,
        onHover,
        onHoverEnd,
    } = $props<{
        placed: PlacedEvent;
        viewport: TimelineViewportState;
        widthPx: number;
        laneColor: string | null;
        selected?: boolean;
        onSelect: (id: string) => void;
        onEdit: (id: string) => void;
        onOpenPage: (id: string) => void;
        onContextMenu: (e: MouseEvent, id: string) => void;
        onHover: (id: string, anchorEl: HTMLElement) => void;
        onHoverEnd: () => void;
    }>();

    const ROW_HEIGHT = 28;
    const x = $derived(serialToX(viewport, widthPx, placed.startSerial));
    const xEnd = $derived(serialToX(viewport, widthPx, placed.endSerial));
    const color = $derived(
        placed.event.color ?? laneColor ?? "var(--color-accent-primary)",
    );

    function handlePointerEnter(e: PointerEvent) {
        if (placed.event.pageLink) {
            onHover(placed.event.id, e.currentTarget as HTMLElement);
        }
    }

    /** Linked chips navigate on click, like map pins with a target page. */
    function handleClick(e: MouseEvent) {
        if (placed.event.pageLink) {
            e.stopPropagation();
            onOpenPage(placed.event.id);
        }
    }
</script>

{#if placed.isPoint}
    <button
        class="chip point"
        class:selected
        class:fuzzy={placed.fuzzy}
        style:left="{x}px"
        style:top="{placed.row * ROW_HEIGHT}px"
        style:--chip-color={color}
        onpointerdown={(e) => {
            // Selection only — dates are edited via the modal, never by
            // dragging, so a stray drag can't silently move an event.
            e.stopPropagation();
            onSelect(placed.event.id);
        }}
        ondblclick={(e) => {
            e.stopPropagation();
            if (placed.event.ingested) onOpenPage(placed.event.id);
            else onEdit(placed.event.id);
        }}
        onclick={handleClick}
        oncontextmenu={(e) => onContextMenu(e, placed.event.id)}
        onpointerenter={handlePointerEnter}
        onpointerleave={onHoverEnd}
        title={placed.event.title}
    >
        <span class="marker"></span>
        {#if placed.event.ingested}<span class="ingested-mark">↗</span>{/if}
        <span class="label">{placed.event.title}</span>
    </button>
{:else}
    {@const barW = Math.max(xEnd - x, MIN_SPAN_PX)}
    {@const labelOutside =
        barW < Math.min(placed.labelPx + LABEL_PAD_PX, MIN_INSIDE_PX)}
    <button
        class="chip span"
        class:selected
        class:fuzzy={placed.fuzzy}
        class:label-outside={labelOutside}
        style:left="{x}px"
        style:top="{placed.row * ROW_HEIGHT}px"
        style:--chip-color={color}
        style:--bar-w="{barW}px"
        onpointerdown={(e) => {
            // Selection only — dates are edited via the modal, never by
            // dragging, so a stray drag can't silently move an event.
            e.stopPropagation();
            onSelect(placed.event.id);
        }}
        ondblclick={(e) => {
            e.stopPropagation();
            if (placed.event.ingested) onOpenPage(placed.event.id);
            else onEdit(placed.event.id);
        }}
        onclick={handleClick}
        oncontextmenu={(e) => onContextMenu(e, placed.event.id)}
        onpointerenter={handlePointerEnter}
        onpointerleave={onHoverEnd}
        title={placed.event.title}
    >
        <span class="span-bar"></span>
        <span class="label"
            >{#if placed.event.circa}<span class="circa">~</span
                >{/if}{#if placed.event.ingested}<span class="ingested-mark"
                    >↗</span
                >{/if}{placed.event.title}</span
        >
    </button>
{/if}

<style>
    .chip {
        position: absolute;
        height: 24px;
        display: flex;
        align-items: center;
        gap: 4px;
        border: none;
        background: none;
        padding: 0;
        cursor: pointer;
        color: var(--color-text-primary);
        font-size: 0.78rem;
        white-space: nowrap;
    }
    /* Points outline the label on selection; spans outline the bar. */
    .chip.point.selected .label {
        outline: 1px solid var(--chip-color);
    }
    .marker {
        width: 10px;
        height: 10px;
        background: var(--chip-color);
        transform: rotate(45deg);
        flex-shrink: 0;
    }
    /* A circa point is the only fuzzy point (year-only dates render as spans);
       dim it slightly to read as approximate. */
    .chip.point.fuzzy {
        opacity: 0.7;
    }

    /* Spans lay out an absolute bar + label so a bar too narrow to hold text
       can push its label outside (to the right), staying legible like a
       point marker's label does. */
    .chip.span {
        display: block;
        width: var(--bar-w);
        overflow: visible;
    }
    .span-bar {
        position: absolute;
        inset: 4px 0;
        border-radius: 3px;
        /* Precise range: solid fill with a hard left cap at the start. */
        background: color-mix(in srgb, var(--chip-color) 35%, transparent);
        border-left: 3px solid var(--chip-color);
    }
    .chip.span.selected .span-bar {
        outline: 2px solid var(--chip-color);
        outline-offset: 1px;
    }
    /* Fuzzy range: drop the hard cap and fade the fill out at both ends to
       signal uncertain boundaries — replaces the old dotted/striped look. */
    .span.fuzzy .span-bar {
        border-left: none;
        background: linear-gradient(
            90deg,
            transparent 0,
            color-mix(in srgb, var(--chip-color) 35%, transparent) 9px,
            color-mix(in srgb, var(--chip-color) 35%, transparent)
                calc(100% - 9px),
            transparent 100%
        );
    }
    /* A narrow fuzzy bar has no room to fade — keep it a solid, slightly
       stronger block so it stays visible when zoomed out. */
    .span.fuzzy.label-outside .span-bar {
        background: color-mix(in srgb, var(--chip-color) 45%, transparent);
    }
    .span .label {
        position: absolute;
        top: 0;
        left: 7px;
        height: 24px;
        line-height: 24px;
        max-width: calc(var(--bar-w) - 10px);
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 0;
    }
    .span.label-outside .label {
        left: calc(var(--bar-w) + 5px);
        max-width: none;
        overflow: visible;
    }
    .circa {
        opacity: 0.7;
    }
    .label {
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 1px 3px;
    }
    .ingested-mark {
        font-size: 0.7em;
        opacity: 0.8;
        flex-shrink: 0;
    }
</style>
