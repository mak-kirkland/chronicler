/**
 * @file Row-stacking layout within one lane: overlapping events get pushed
 * to lower rows (greedy interval scheduling). Pure and zoom-aware only via
 * `minGapDays` (the days a point marker occupies at the current zoom).
 */
import type { CompiledCalendar } from "./calendar";
import type { TimelineEvent } from "./timelineModels";
import { datePrecision } from "./calendarModels";

/** Width of the lane-label gutter; the axis and all serial<->pixel math use
 * the remaining track width. */
export const LANE_GUTTER_PX = 120;

export interface PlacedEvent {
    event: TimelineEvent;
    startSerial: number;
    endSerial: number;
    row: number;
    isPoint: boolean;
    fuzzy: boolean;
}

export function layoutLane(
    cal: CompiledCalendar,
    events: TimelineEvent[],
    minGapDays: number,
): PlacedEvent[] {
    const sorted = [...events].sort((a, b) =>
        cal.compareDates(a.start, b.start),
    );
    const rowEnds: number[] = [];
    const placed: PlacedEvent[] = [];
    for (const event of sorted) {
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
        const occupiedEnd = Math.max(endSerial, startSerial + minGapDays);

        let row = 0;
        while (row < rowEnds.length && rowEnds[row] > startSerial) row++;
        rowEnds[row] = occupiedEnd;
        placed.push({ event, startSerial, endSerial, row, isPoint, fuzzy });
    }
    return placed;
}

export function laneRowCount(placed: PlacedEvent[]): number {
    return placed.reduce((max, p) => Math.max(max, p.row + 1), 1);
}
