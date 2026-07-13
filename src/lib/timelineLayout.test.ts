import { describe, it, expect } from "vitest";
import { layoutLane, laneRowCount } from "./timelineLayout";
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

describe("layoutLane", () => {
    it("non-overlapping events share row 0", () => {
        const placed = layoutLane(
            cal,
            [
                mk({ start: { year: 100, month: 0, day: 1 } }),
                mk({ start: { year: 200, month: 0, day: 1 } }),
            ],
            0,
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
            0,
        );
        expect(placed[0].row).toBe(0);
        expect(placed[1].row).toBe(1);
        expect(placed[2].row).toBe(0); // 160 starts after the first span ends
        expect(laneRowCount(placed)).toBe(2);
    });

    it("points reserve minGapDays of width for stacking", () => {
        const placed = layoutLane(
            cal,
            [
                mk({ start: { year: 100, month: 0, day: 1 } }),
                mk({ start: { year: 100, month: 0, day: 2 } }),
            ],
            5,
        );
        expect(placed[1].row).toBe(1);
    });

    it("classifies points, spans, and fuzzy dates", () => {
        // Looked up by id: layoutLane returns sorted order (coarser first
        // on ties), not input order.
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
            0,
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
        const placed = layoutLane(cal, [b, a], 0);
        expect(placed[0].event.id).toBe("a");
    });
});
