import { describe, it, expect } from "vitest";
import {
    serialToX,
    xToSerial,
    zoomAbout,
    panByPixels,
    fitToEvents,
} from "./timelineViewport";
import { compileCalendar } from "./calendar";
import { GREGORIAN } from "./calendarPresets";
import type { TimelineEvent } from "./timelineModels";

const vp = { centerSerial: 1000, daysPerPixel: 2 };

describe("timelineViewport", () => {
    it("serialToX and xToSerial invert each other", () => {
        expect(serialToX(vp, 800, 1000)).toBe(400);
        expect(xToSerial(vp, 800, 400)).toBe(1000);
        expect(xToSerial(vp, 800, serialToX(vp, 800, 1234.5))).toBeCloseTo(
            1234.5,
        );
    });

    it("zoomAbout keeps the serial under the cursor fixed", () => {
        const cursorX = 600;
        const before = xToSerial(vp, 800, cursorX);
        const zoomed = zoomAbout(vp, 800, cursorX, 0.5);
        expect(zoomed.daysPerPixel).toBe(1);
        expect(xToSerial(zoomed, 800, cursorX)).toBeCloseTo(before);
    });

    it("zoomAbout clamps extreme zoom", () => {
        const tiny = zoomAbout(vp, 800, 400, 1e-12);
        expect(tiny.daysPerPixel).toBeGreaterThan(0);
        const huge = zoomAbout(vp, 800, 400, 1e12);
        expect(huge.daysPerPixel).toBeLessThanOrEqual(100000);
    });

    it("panByPixels shifts the center by pixel distance", () => {
        expect(panByPixels(vp, -50).centerSerial).toBe(1100);
    });

    it("fitToEvents frames all events with padding", () => {
        const cal = compileCalendar(GREGORIAN);
        const mk = (year: number): TimelineEvent => ({
            id: String(year),
            laneId: "l",
            title: "",
            start: { year },
            end: null,
            circa: false,
            description: "",
            pageLink: null,
            color: null,
        });
        const fitted = fitToEvents(cal, [mk(100), mk(200)], 1000);
        expect(fitted).not.toBeNull();
        const left = serialToX(fitted!, 1000, cal.yearStartSerial(100));
        const right = serialToX(fitted!, 1000, cal.yearStartSerial(201));
        expect(left).toBeGreaterThan(0);
        expect(right).toBeLessThan(1000);
    });

    it("fitToEvents returns null with no events", () => {
        const cal = compileCalendar(GREGORIAN);
        expect(fitToEvents(cal, [], 1000)).toBeNull();
    });
});
