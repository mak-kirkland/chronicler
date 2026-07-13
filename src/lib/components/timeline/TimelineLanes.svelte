<script lang="ts">
    import type { CompiledCalendar } from "$lib/calendar";
    import type {
        TimelineData,
        TimelineViewportState,
    } from "$lib/timelineModels";
    import {
        layoutLane,
        laneRowCount,
        LANE_GUTTER_PX,
        type PlacedEvent,
    } from "$lib/timelineLayout";
    import { xToSerial } from "$lib/timelineViewport";
    import TimelineEventChip from "./TimelineEventChip.svelte";
    import { t } from "$lib/i18n";

    let {
        timeline,
        cal,
        viewport,
        widthPx,
        selectedId,
        onSelect,
        onEditEvent,
        onOpenEventPage,
        onCreateAt,
        onEventContextMenu,
        onEventHover,
        onEventHoverEnd,
        onLaneContextMenu,
        onAddLane,
    } = $props<{
        timeline: TimelineData;
        cal: CompiledCalendar;
        viewport: TimelineViewportState;
        widthPx: number;
        selectedId: string | null;
        onSelect: (id: string | null) => void;
        onEditEvent: (id: string) => void;
        onOpenEventPage: (id: string) => void;
        onCreateAt: (laneId: string, serial: number) => void;
        onEventContextMenu: (e: MouseEvent, id: string) => void;
        onEventHover: (id: string, anchorEl: HTMLElement) => void;
        onEventHoverEnd: () => void;
        onLaneContextMenu: (e: MouseEvent, laneId: string) => void;
        onAddLane: () => void;
    }>();

    const ROW_HEIGHT = 28;
    const LANE_MIN_HEIGHT = 40;
    /** Days a point marker's label occupies at this zoom, for row stacking. */
    const minGapDays = $derived(viewport.daysPerPixel * 120);

    interface LaidOutLane {
        lane: TimelineData["lanes"][number];
        placed: PlacedEvent[];
        height: number;
    }

    const lanes = $derived.by<LaidOutLane[]>(() => {
        // Virtualization: only place events overlapping the view (+20% each side).
        const viewStart = xToSerial(viewport, widthPx, -0.2 * widthPx);
        const viewEnd = xToSerial(viewport, widthPx, 1.2 * widthPx);
        return timeline.lanes.map((lane: TimelineData["lanes"][number]) => {
            const events = timeline.events.filter(
                (e: TimelineData["events"][number]) => e.laneId === lane.id,
            );
            const placed = layoutLane(cal, events, minGapDays).filter(
                (p) =>
                    Math.max(p.endSerial, p.startSerial + minGapDays) >=
                        viewStart && p.startSerial <= viewEnd,
            );
            const height = lane.collapsed
                ? LANE_MIN_HEIGHT
                : Math.max(
                      LANE_MIN_HEIGHT,
                      laneRowCount(placed) * ROW_HEIGHT + 12,
                  );
            return { lane, placed, height };
        });
    });
</script>

<div class="lanes">
    {#each lanes as { lane, placed, height } (lane.id)}
        <div class="lane" style:height="{height}px">
            <div
                class="lane-label"
                style:width="{LANE_GUTTER_PX}px"
                style:--lane-color={lane.color ?? "transparent"}
                oncontextmenu={(e) => onLaneContextMenu(e, lane.id)}
                role="presentation"
            >
                {lane.name || $t("timeline.unnamedLane")}
            </div>
            <div
                class="lane-track"
                ondblclick={(e) => {
                    const rect = (
                        e.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    onCreateAt(
                        lane.id,
                        xToSerial(viewport, widthPx, e.clientX - rect.left),
                    );
                }}
                onpointerdown={() => onSelect(null)}
                role="list"
            >
                {#if !lane.collapsed}
                    {#each placed as p (p.event.id)}
                        <TimelineEventChip
                            placed={p}
                            {viewport}
                            {widthPx}
                            laneColor={lane.color}
                            selected={selectedId === p.event.id}
                            {onSelect}
                            onEdit={onEditEvent}
                            onOpenPage={onOpenEventPage}
                            onContextMenu={onEventContextMenu}
                            onHover={onEventHover}
                            onHoverEnd={onEventHoverEnd}
                        />
                    {/each}
                {/if}
            </div>
        </div>
    {/each}
    <div class="add-lane-row">
        <button
            class="add-lane"
            style:width="{LANE_GUTTER_PX}px"
            onpointerdown={(e) => e.stopPropagation()}
            onclick={onAddLane}
        >
            + {$t("timeline.addLane")}
        </button>
    </div>
</div>

<style>
    .lanes {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
    }
    .lane {
        display: flex;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .lane-label {
        flex-shrink: 0;
        padding: 8px;
        font-size: 0.8rem;
        font-weight: bold;
        color: var(--color-text-secondary);
        border-right: 1px solid var(--color-border-primary);
        /* Lane color shows as an edge bar on the label. */
        border-left: 3px solid var(--lane-color, transparent);
        background: var(--color-background-secondary);
        position: sticky;
        left: 0;
        box-sizing: border-box;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .lane-track {
        position: relative;
        flex: 1;
        padding-top: 6px;
        /* Chips panned past the left edge get negative `left`; clip them so
           they slide under the lane label instead of painting over it. */
        overflow: hidden;
    }
    .add-lane-row {
        display: flex;
    }
    .add-lane {
        flex-shrink: 0;
        box-sizing: border-box;
        padding: 6px 8px;
        border: none;
        border-right: 1px solid var(--color-border-primary);
        border-bottom: 1px solid var(--color-border-primary);
        background: var(--color-background-secondary);
        color: var(--color-text-secondary);
        font-size: 0.75rem;
        font-family: inherit;
        text-align: left;
        cursor: pointer;
        opacity: 0.75;
    }
    .add-lane:hover {
        opacity: 1;
        color: var(--color-text-primary);
        background: var(--color-background-tertiary);
    }
</style>
