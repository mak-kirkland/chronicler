<script lang="ts">
    import type { CompiledCalendar } from "$lib/calendar";
    import type { TimelineViewportState } from "$lib/timelineModels";
    import { ticks, eraBands } from "$lib/timelineTicks";
    import { serialToX, xToSerial } from "$lib/timelineViewport";

    let {
        cal,
        viewport,
        widthPx,
        cursorX = null,
    } = $props<{
        cal: CompiledCalendar;
        viewport: TimelineViewportState;
        widthPx: number;
        cursorX: number | null;
    }>();

    const startSerial = $derived(xToSerial(viewport, widthPx, 0));
    const endSerial = $derived(xToSerial(viewport, widthPx, widthPx));
    const axisTicks = $derived(
        ticks(
            cal,
            startSerial,
            endSerial,
            Math.max(4, Math.floor(widthPx / 110)),
        ),
    );
    const bands = $derived(eraBands(cal, startSerial, endSerial));
    const cursorLabel = $derived.by(() => {
        if (cursorX == null) return null;
        const d = cal.fromSerial(xToSerial(viewport, widthPx, cursorX));
        return cal.format({ year: d.year, month: d.month, day: d.day }, "long");
    });
    /** Flip the readout to the left of the cursor line near the right edge. */
    const cursorFlipped = $derived(cursorX != null && cursorX > widthPx - 180);
</script>

<div class="axis" style:width="{widthPx}px">
    <div class="era-row">
        {#each bands as band (band.name + band.startSerial)}
            <div
                class="era-band"
                style:left="{serialToX(viewport, widthPx, band.startSerial)}px"
                style:width="{serialToX(viewport, widthPx, band.endSerial) -
                    serialToX(viewport, widthPx, band.startSerial)}px"
            >
                <span class="era-name">{band.name}</span>
            </div>
        {/each}
    </div>
    <div class="tick-row">
        {#each axisTicks as tick (tick.serial)}
            <div
                class="tick"
                style:left="{serialToX(viewport, widthPx, tick.serial)}px"
            >
                <div class="tick-mark"></div>
                <span class="tick-label">{tick.label}</span>
            </div>
        {/each}
    </div>
    {#if cursorLabel != null && cursorX != null}
        <div class="cursor" style:left="{cursorX}px">
            <span class="cursor-label" class:flipped={cursorFlipped}>
                {cursorLabel}
            </span>
        </div>
    {/if}
</div>

<style>
    .axis {
        position: relative;
        height: 60px;
        border-bottom: 1px solid var(--color-border-primary);
        overflow: hidden;
        flex-shrink: 0;
        user-select: none;
    }
    .era-row {
        position: relative;
        height: 24px;
        border-bottom: 1px solid var(--color-border-primary);
        box-sizing: border-box;
    }
    .era-band {
        position: absolute;
        top: 0;
        height: 100%;
        display: flex;
        align-items: center;
        background: color-mix(
            in srgb,
            var(--color-accent-primary) 12%,
            transparent
        );
        border-inline: 1px solid var(--color-border-primary);
        overflow: hidden;
        white-space: nowrap;
        box-sizing: border-box;
    }
    .era-name {
        font-size: 0.7rem;
        line-height: 1;
        color: var(--color-text-secondary);
        padding: 0 0.5rem;
    }
    .tick-row {
        position: relative;
        height: 36px;
    }
    .tick {
        position: absolute;
        top: 0;
    }
    .tick-mark {
        width: 1px;
        height: 7px;
        background: var(--color-border-primary);
    }
    .tick-label {
        display: inline-block;
        margin-top: 2px;
        font-size: 0.7rem;
        line-height: 1;
        color: var(--color-text-secondary);
        transform: translateX(-50%);
        white-space: nowrap;
    }
    /* The cursor readout: a full-height dashed line plus a solid-background
       chip so it stays readable over tick labels; flips sides near the
       right edge instead of clipping. */
    .cursor {
        position: absolute;
        top: 0;
        height: 100%;
        border-left: 1px dashed var(--color-accent-primary);
        pointer-events: none;
    }
    .cursor-label {
        position: absolute;
        top: 3px;
        left: 6px;
        padding: 2px 8px;
        font-size: 0.7rem;
        line-height: 1.2;
        white-space: nowrap;
        color: var(--color-text-primary);
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: 4px;
    }
    .cursor-label.flipped {
        left: auto;
        right: 6px;
    }
</style>
