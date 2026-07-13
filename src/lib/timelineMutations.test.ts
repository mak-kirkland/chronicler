import { describe, it, expect } from "vitest";
import { emptyTimeline, genId } from "./timelineModels";
import type { TimelineEvent } from "./timelineModels";
import * as M from "./timelineMutations";

function makeEvent(laneId: string, year: number): TimelineEvent {
    return {
        id: genId(),
        laneId,
        title: "E",
        start: { year },
        end: null,
        circa: false,
        description: "",
        pageLink: null,
        color: null,
    };
}

describe("timelineMutations", () => {
    it("addEvent appends without mutating the input", () => {
        const t = emptyTimeline("T", "g");
        const e = makeEvent(t.lanes[0].id, 5);
        const next = M.addEvent(t, e);
        expect(next.events).toHaveLength(1);
        expect(t.events).toHaveLength(0);
    });

    it("updateEvent patches one event", () => {
        const t = emptyTimeline("T", "g");
        const e = makeEvent(t.lanes[0].id, 5);
        const next = M.updateEvent(M.addEvent(t, e), e.id, { title: "New" });
        expect(next.events[0].title).toBe("New");
    });

    it("deleteEvent removes it", () => {
        const t = emptyTimeline("T", "g");
        const e = makeEvent(t.lanes[0].id, 5);
        expect(M.deleteEvent(M.addEvent(t, e), e.id).events).toHaveLength(0);
    });

    it("addLane / renameLane / moveLane", () => {
        let t = emptyTimeline("T", "g");
        t = M.addLane(t, "Wars");
        expect(t.lanes).toHaveLength(2);
        t = M.renameLane(t, t.lanes[1].id, "Kings");
        expect(t.lanes[1].name).toBe("Kings");
        t = M.moveLane(t, t.lanes[1].id, -1);
        expect(t.lanes[0].name).toBe("Kings");
        // Moving past the edge is a no-op.
        expect(M.moveLane(t, t.lanes[0].id, -1).lanes[0].name).toBe("Kings");
    });

    it("deleteLane removes the lane and its events", () => {
        let t = emptyTimeline("T", "g");
        t = M.addLane(t, "Wars");
        const warsId = t.lanes[1].id;
        t = M.addEvent(t, makeEvent(warsId, 3));
        t = M.addEvent(t, makeEvent(t.lanes[0].id, 4));
        const next = M.deleteLane(t, warsId);
        expect(next.lanes).toHaveLength(1);
        expect(next.events).toHaveLength(1);
    });

    it("deleteLane refuses to remove the last lane", () => {
        const t = emptyTimeline("T", "g");
        expect(M.deleteLane(t, t.lanes[0].id)).toBe(t);
    });
});
