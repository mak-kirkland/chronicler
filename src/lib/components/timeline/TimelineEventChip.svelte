<script lang="ts">
    import type { PlacedEvent } from "$lib/timelineLayout";
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
            onEdit(placed.event.id);
        }}
        onclick={handleClick}
        oncontextmenu={(e) => onContextMenu(e, placed.event.id)}
        onpointerenter={handlePointerEnter}
        onpointerleave={onHoverEnd}
        title={placed.event.title}
    >
        <span class="marker"></span>
        <span class="label">{placed.event.title}</span>
    </button>
{:else}
    <button
        class="chip span"
        class:selected
        class:fuzzy={placed.fuzzy}
        style:left="{x}px"
        style:width="{Math.max(xEnd - x, 6)}px"
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
            onEdit(placed.event.id);
        }}
        onclick={handleClick}
        oncontextmenu={(e) => onContextMenu(e, placed.event.id)}
        onpointerenter={handlePointerEnter}
        onpointerleave={onHoverEnd}
        title={placed.event.title}
    >
        <span class="label">{placed.event.title}</span>
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
    .chip.selected .label {
        outline: 1px solid var(--chip-color);
    }
    .marker {
        width: 10px;
        height: 10px;
        background: var(--chip-color);
        transform: rotate(45deg);
        flex-shrink: 0;
    }
    .span {
        background: color-mix(in srgb, var(--chip-color) 30%, transparent);
        border-left: 3px solid var(--chip-color);
        border-radius: 3px;
        padding: 0 6px;
        overflow: hidden;
    }
    .fuzzy {
        opacity: 0.75;
    }
    .span.fuzzy {
        border-left-style: dashed;
        background: repeating-linear-gradient(
            90deg,
            color-mix(in srgb, var(--chip-color) 25%, transparent),
            color-mix(in srgb, var(--chip-color) 25%, transparent) 6px,
            transparent 6px,
            transparent 9px
        );
    }
    .label {
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 1px 3px;
    }
</style>
