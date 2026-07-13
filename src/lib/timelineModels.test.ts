import { describe, it, expect } from "vitest";
import { emptyTimeline, parseTimelineData, genId } from "./timelineModels";

describe("timelineModels", () => {
    it("emptyTimeline has one default lane and no events", () => {
        const t = emptyTimeline("My History", "gregorian");
        expect(t.version).toBe(1);
        expect(t.title).toBe("My History");
        expect(t.calendarId).toBe("gregorian");
        expect(t.lanes).toHaveLength(1);
        expect(t.events).toEqual([]);
        expect(t.viewport).toBeNull();
    });

    it("genId returns unique ids", () => {
        expect(genId()).not.toBe(genId());
    });

    it("parseTimelineData round-trips emptyTimeline", () => {
        const t = emptyTimeline("T", "gregorian");
        expect(parseTimelineData(JSON.stringify(t))).toEqual(t);
    });

    it("parseTimelineData fills defaults for sparse events", () => {
        const t = parseTimelineData(
            JSON.stringify({
                title: "Sparse",
                calendarId: "gregorian",
                lanes: [{ id: "l1", name: "Lane" }],
                events: [
                    { id: "e1", laneId: "l1", title: "E", start: { year: 5 } },
                ],
            }),
        );
        expect(t.version).toBe(1);
        expect(t.events[0]).toEqual({
            id: "e1",
            laneId: "l1",
            title: "E",
            start: { year: 5 },
            end: null,
            circa: false,
            description: "",
            pageLink: null,
            color: null,
        });
        expect(t.lanes[0].collapsed).toBe(false);
        expect(t.lanes[0].color).toBeNull();
    });

    it("parseTimelineData ensures at least one lane", () => {
        const t = parseTimelineData(
            JSON.stringify({
                title: "X",
                calendarId: "g",
                lanes: [],
                events: [],
            }),
        );
        expect(t.lanes.length).toBe(1);
    });

    it("parseTimelineData rejects garbage", () => {
        expect(() => parseTimelineData("not json")).toThrow();
        expect(() => parseTimelineData('"just a string"')).toThrow();
        expect(() => parseTimelineData('{"events": 42}')).toThrow();
    });
});
