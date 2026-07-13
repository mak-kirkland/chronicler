/**
 * @file serial <-> pixel mapping for the timeline view. Mirrors the role of
 * canvasViewport.ts. A viewport is {centerSerial, daysPerPixel}: the serial
 * at the horizontal center of the view and the zoom level.
 */
import type { CompiledCalendar } from "./calendar";
import type { TimelineEvent, TimelineViewportState } from "./timelineModels";

/** One pixel = one second at maximum zoom-in. */
export const MIN_DAYS_PER_PIXEL = 1 / 86400;
/** ~274 years per pixel at maximum zoom-out. */
export const MAX_DAYS_PER_PIXEL = 100000;

export function serialToX(
    vp: TimelineViewportState,
    widthPx: number,
    serial: number,
): number {
    return (serial - vp.centerSerial) / vp.daysPerPixel + widthPx / 2;
}

export function xToSerial(
    vp: TimelineViewportState,
    widthPx: number,
    x: number,
): number {
    return (x - widthPx / 2) * vp.daysPerPixel + vp.centerSerial;
}

export function zoomAbout(
    vp: TimelineViewportState,
    widthPx: number,
    xPx: number,
    factor: number,
): TimelineViewportState {
    const anchor = xToSerial(vp, widthPx, xPx);
    const daysPerPixel = Math.min(
        MAX_DAYS_PER_PIXEL,
        Math.max(MIN_DAYS_PER_PIXEL, vp.daysPerPixel * factor),
    );
    // Keep the serial under the cursor at the same x.
    const centerSerial = anchor - (xPx - widthPx / 2) * daysPerPixel;
    return { centerSerial, daysPerPixel };
}

export function panByPixels(
    vp: TimelineViewportState,
    dxPx: number,
): TimelineViewportState {
    return { ...vp, centerSerial: vp.centerSerial - dxPx * vp.daysPerPixel };
}

export function fitToEvents(
    cal: CompiledCalendar,
    events: TimelineEvent[],
    widthPx: number,
): TimelineViewportState | null {
    if (events.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const e of events) {
        const [s] = cal.serialRange(e.start);
        const [, eEnd] = cal.serialRange(e.end ?? e.start);
        min = Math.min(min, s);
        max = Math.max(max, eEnd);
    }
    const span = Math.max(max - min, 1);
    const daysPerPixel = Math.min(
        MAX_DAYS_PER_PIXEL,
        Math.max(MIN_DAYS_PER_PIXEL, span / (widthPx * 0.8)),
    );
    return { centerSerial: (min + max) / 2, daysPerPixel };
}
