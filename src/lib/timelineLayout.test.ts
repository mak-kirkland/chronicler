import { describe, it, expect } from "vitest";
import {
    layoutLane,
    laneRowCount,
    MIN_SPAN_PX,
    MARKER_PX,
    LABEL_GAP_PX,
    LABEL_PAD_PX,
    MIN_INSIDE_PX,
} from "./timelineLayout";
import { compileCalendar } from "./calendar";
import { GREGORIAN } from "./calendarPresets";
import type { TimelineEvent } from "./timelineModels";

const cal = compileCalendar(GREGORIAN);

function mk(over: Partial<TimelineEvent>): TimelineEvent {
    return {
        id: over.id ?? crypto.randomUUID(),
        laneId: "l",
        title: "E",
        start: { year: 100, month: 0, day: 1 },
        end: null,
        circa: false,
        description: "",
        pageLink: null,
        color: null,
        ...over,
    };
}

/** A label-width function returning a fixed pixel width for every event. */
const fixed = (px: number) => () => px;

describe("layoutLane", () => {
    it("non-overlapping events share row 0", () => {
        const placed = layoutLane(
            cal,
            [
                mk({ start: { year: 100, month: 0, day: 1 } }),
                mk({ start: { year: 200, month: 0, day: 1 } }),
            ],
            1,
            fixed(40),
        );
        expect(placed.map((p) => p.row)).toEqual([0, 0]);
    });

    it("overlapping spans stack onto separate rows", () => {
        const placed = layoutLane(
            cal,
            [
                mk({ start: { year: 100 }, end: { year: 150 } }),
                mk({ start: { year: 120 }, end: { year: 180 } }),
                mk({ start: { year: 160 }, end: { year: 190 } }),
            ],
            1,
            fixed(0),
        );
        expect(placed[0].row).toBe(0);
        expect(placed[1].row).toBe(1);
        expect(placed[2].row).toBe(0); // 160 starts after the first span ends
        expect(laneRowCount(placed)).toBe(2);
    });

    it("points reserve marker + label width for stacking", () => {
        // Jan 1 and Jan 2 are one day apart; a 40px label at 1 day/px reserves
        // far more than a day, so the second point stacks.
        const placed = layoutLane(
            cal,
            [
                mk({ start: { year: 100, month: 0, day: 1 } }),
                mk({ start: { year: 100, month: 0, day: 2 } }),
            ],
            1,
            fixed(40),
        );
        expect(placed[1].row).toBe(1);
    });

    it("wider labels stack sooner than narrow ones", () => {
        // Jan 1 -> Feb 20 is 50 days apart. At 1 day/px a short label's
        // footprint clears that gap (same row); a long one does not (stacks).
        const events = [
            mk({ id: "a", start: { year: 100, month: 0, day: 1 } }),
            mk({ id: "b", start: { year: 100, month: 1, day: 20 } }),
        ];
        const narrow = layoutLane(cal, events, 1, fixed(10));
        const wide = layoutLane(cal, events, 1, fixed(120));
        const rowOf = (ps: typeof narrow, id: string) =>
            ps.find((p) => p.event.id === id)!.row;
        expect(rowOf(narrow, "b")).toBe(0);
        expect(rowOf(wide, "b")).toBe(1);
    });

    it("exposes the measured label width on each placed event", () => {
        const placed = layoutLane(cal, [mk({})], 1, fixed(77));
        expect(placed[0].labelPx).toBe(77);
    });

    it("a span wide enough to hold its label reserves only the bar", () => {
        // Range dwarfs the label -> label sits inside -> footprint == the bar,
        // so the occupied end is exactly the event's end.
        const placed = layoutLane(
            cal,
            [mk({ start: { year: 100 }, end: { year: 200 } })],
            1,
            fixed(50),
        );
        expect(placed[0].occupiedEndSerial).toBe(placed[0].endSerial);
    });

    it("a long label truncates inside once the bar is wide enough", () => {
        // Jan 1 -> Jun 1 is ~151 days: a bar comfortably past MIN_INSIDE_PX but
        // far shorter than the 300px label. The label truncates inside rather
        // than reserving outside room, so the footprint is just the bar.
        const placed = layoutLane(
            cal,
            [
                mk({
                    start: { year: 100, month: 0, day: 1 },
                    end: { year: 100, month: 5, day: 1 },
                }),
            ],
            1,
            fixed(300),
        );
        const barDays = placed[0].endSerial - placed[0].startSerial;
        expect(barDays).toBeGreaterThan(MIN_INSIDE_PX); // precondition
        expect(placed[0].occupiedEndSerial).toBe(placed[0].endSerial);
    });

    it("a span too narrow for its label reserves bar + label", () => {
        // A 1-day range clamps to the min bar; a 100px label can't fit inside,
        // so the footprint is bar + gap + label + pad past the start.
        const placed = layoutLane(
            cal,
            [
                mk({
                    start: { year: 100, month: 0, day: 1 },
                    end: { year: 100, month: 0, day: 2 },
                }),
            ],
            1,
            fixed(100),
        );
        const expected =
            placed[0].startSerial +
            MIN_SPAN_PX +
            LABEL_GAP_PX +
            100 +
            LABEL_PAD_PX;
        expect(placed[0].occupiedEndSerial).toBeCloseTo(expected, 5);
    });

    it("classifies points, spans, and fuzzy dates", () => {
        const placed = layoutLane(
            cal,
            [
                mk({ id: "point", start: { year: 100, month: 0, day: 1 } }),
                mk({ id: "yearOnly", start: { year: 100 } }),
                mk({
                    id: "circaSpan",
                    start: { year: 100 },
                    end: { year: 101 },
                    circa: true,
                }),
            ],
            1,
            fixed(0),
        );
        const byId = new Map(placed.map((p) => [p.event.id, p]));
        expect(byId.get("point")!.isPoint).toBe(true);
        expect(byId.get("point")!.fuzzy).toBe(false);
        expect(byId.get("yearOnly")!.isPoint).toBe(false); // year-only renders as fuzzy range
        expect(byId.get("yearOnly")!.fuzzy).toBe(true);
        expect(byId.get("circaSpan")!.isPoint).toBe(false);
        expect(byId.get("circaSpan")!.fuzzy).toBe(true); // circa
    });

    it("events sort by start with coarser dates first on ties", () => {
        const a = mk({ id: "a", start: { year: 100 } });
        const b = mk({ id: "b", start: { year: 100, month: 0, day: 1 } });
        const placed = layoutLane(cal, [b, a], 1, fixed(0));
        expect(placed[0].event.id).toBe("a");
    });

    describe("span/point banding", () => {
        it("places points below all spans even without temporal overlap", () => {
            const placed = layoutLane(
                cal,
                [
                    mk({
                        id: "span",
                        start: { year: 100 },
                        end: { year: 200 },
                    }),
                    mk({ id: "point", start: { year: 500, month: 0, day: 1 } }),
                ],
                1,
                fixed(0),
            );
            const byId = new Map(placed.map((p) => [p.event.id, p]));
            expect(byId.get("span")!.row).toBe(0);
            expect(byId.get("point")!.row).toBe(1);
        });

        it("stacks the point band beneath every span row", () => {
            const placed = layoutLane(
                cal,
                [
                    // Two overlapping spans occupy span rows 0 and 1.
                    mk({ id: "s1", start: { year: 100 }, end: { year: 180 } }),
                    mk({ id: "s2", start: { year: 120 }, end: { year: 200 } }),
                    // A point far to the right must still land on row 2.
                    mk({ id: "p", start: { year: 900, month: 0, day: 1 } }),
                ],
                1,
                fixed(0),
            );
            const byId = new Map(placed.map((p) => [p.event.id, p]));
            expect(byId.get("s1")!.row).toBe(0);
            expect(byId.get("s2")!.row).toBe(1);
            expect(byId.get("p")!.row).toBe(2);
            expect(laneRowCount(placed)).toBe(3);
        });

        it("a point-only lane fills from row 0 (no empty span band)", () => {
            const placed = layoutLane(
                cal,
                [
                    mk({ id: "p1", start: { year: 100, month: 0, day: 1 } }),
                    mk({ id: "p2", start: { year: 500, month: 0, day: 1 } }),
                ],
                1,
                fixed(0),
            );
            expect(placed.every((p) => p.row === 0)).toBe(true);
        });
    });

    it("keeps the sizing constants sane", () => {
        expect(MARKER_PX).toBeGreaterThan(0);
        expect(MIN_SPAN_PX).toBeGreaterThan(0);
    });
});
