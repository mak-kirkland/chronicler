/**
 * @file Row-stacking layout within one lane: overlapping events get pushed to
 * lower rows (greedy interval scheduling). Each event reserves horizontal room
 * for its *rendered* footprint — the bar plus its label — measured in pixels
 * and converted to serial days via `daysPerPixel`, so events stack exactly
 * when their labels would actually collide (not at a fixed guess).
 */
import type { CompiledCalendar } from "./calendar";
import type { TimelineEvent } from "./timelineModels";
import { datePrecision } from "./calendarModels";

/** Width of the lane-label gutter; the axis and all serial<->pixel math use
 * the remaining track width. */
export const LANE_GUTTER_PX = 120;

/** A span never renders (or reserves) narrower than this, so short or
 * zoomed-out ranges stay a visible block. */
export const MIN_SPAN_PX = 14;
/** Horizontal room a point's diamond marker (+ its gap) occupies. */
export const MARKER_PX = 14;
/** Gap between a narrow span's bar and its label when the label sits outside. */
export const LABEL_GAP_PX = 5;
/** Breathing room reserved after a label so neighbours don't touch. */
export const LABEL_PAD_PX = 10;
/** Once a bar is at least this wide it holds the label *inside* (truncated
 * with an ellipsis if needed) rather than letting a long label dangle outside
 * a long block. Kept low enough (~10 chars + ellipsis) that the truncate-
 * inside range is wide rather than a thin sliver around typical label widths;
 * bars narrower than this still float the full label to the right so short
 * spans stay legible when zoomed out. */
export const MIN_INSIDE_PX = 72;

export interface PlacedEvent {
    event: TimelineEvent;
    startSerial: number;
    endSerial: number;
    row: number;
    isPoint: boolean;
    fuzzy: boolean;
    /** Rendered label width in px (from the injected measurer). The chip uses
     * it to decide whether the label fits inside the bar. */
    labelPx: number;
    /** Serial at which this event's rendered footprint ends — the value the
     * greedy packer and view virtualization treat as its right edge. */
    occupiedEndSerial: number;
}

interface EventMeta {
    event: TimelineEvent;
    startSerial: number;
    endSerial: number;
    isPoint: boolean;
    fuzzy: boolean;
    labelPx: number;
    occupiedEndSerial: number;
}

export function layoutLane(
    cal: CompiledCalendar,
    events: TimelineEvent[],
    daysPerPixel: number,
    labelWidthPx: (event: TimelineEvent) => number,
): PlacedEvent[] {
    const metas = events.map((event) => {
        const [startSerial, startMax] = cal.serialRange(event.start);
        const endSerial = event.end ? cal.serialRange(event.end)[1] : startMax;
        const dayPrecise = ["day", "hour", "minute"].includes(
            datePrecision(event.start),
        );
        const isPoint = event.end == null && dayPrecise;
        const fuzzy =
            event.circa ||
            !dayPrecise ||
            (event.end != null &&
                !["day", "hour", "minute"].includes(datePrecision(event.end)));
        const labelPx = labelWidthPx(event);

        // Reserved footprint in px, then converted to serial days. A point is
        // marker + label. A span is its bar; if the label can't fit inside the
        // bar it renders outside (to the right) and the reservation grows to
        // cover it.
        let footprintPx: number;
        if (isPoint) {
            footprintPx = MARKER_PX + labelPx + LABEL_PAD_PX;
        } else {
            const rangePx = (endSerial - startSerial) / daysPerPixel;
            const barPx = Math.max(rangePx, MIN_SPAN_PX);
            // Label goes inside when it fully fits, or once the bar is wide
            // enough to be worth truncating into; otherwise it floats outside
            // and the reservation grows to cover it.
            const inside =
                barPx >= Math.min(labelPx + LABEL_PAD_PX, MIN_INSIDE_PX);
            footprintPx = inside
                ? barPx
                : barPx + LABEL_GAP_PX + labelPx + LABEL_PAD_PX;
        }
        const occupiedEndSerial = Math.max(
            endSerial,
            startSerial + footprintPx * daysPerPixel,
        );
        return {
            event,
            startSerial,
            endSerial,
            isPoint,
            fuzzy,
            labelPx,
            occupiedEndSerial,
        };
    });

    // Two vertical bands per lane: spans occupy the top rows, points fill in
    // below them. This keeps longer (usually more significant) events on top
    // and guarantees a point's outside label can never paint over a span,
    // since the two never share a row.
    const placed: PlacedEvent[] = [];
    const spanRows = packBand(
        cal,
        metas.filter((m) => !m.isPoint),
        0,
        placed,
    );
    packBand(
        cal,
        metas.filter((m) => m.isPoint),
        spanRows,
        placed,
    );
    return placed;
}

/** Greedy interval stacking within one band. Places each event on the first
 * row whose last occupant's footprint ends before it starts, offset by
 * `rowOffset` so the point band lands beneath the span band. Returns the
 * number of rows used. */
function packBand(
    cal: CompiledCalendar,
    metas: EventMeta[],
    rowOffset: number,
    out: PlacedEvent[],
): number {
    const sorted = [...metas].sort((a, b) =>
        cal.compareDates(a.event.start, b.event.start),
    );
    const rowEnds: number[] = [];
    for (const m of sorted) {
        let row = 0;
        while (row < rowEnds.length && rowEnds[row] > m.startSerial) row++;
        rowEnds[row] = m.occupiedEndSerial;
        out.push({
            event: m.event,
            startSerial: m.startSerial,
            endSerial: m.endSerial,
            row: rowOffset + row,
            isPoint: m.isPoint,
            fuzzy: m.fuzzy,
            labelPx: m.labelPx,
            occupiedEndSerial: m.occupiedEndSerial,
        });
    }
    return rowEnds.length;
}

export function laneRowCount(placed: PlacedEvent[]): number {
    return placed.reduce((max, p) => Math.max(max, p.row + 1), 1);
}
