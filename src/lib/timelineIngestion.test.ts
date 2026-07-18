import { describe, expect, it } from "vitest";
import type { DatedPageInfo, FileNode } from "./bindings";
import { compileCalendar } from "./calendar";
import { GREGORIAN } from "./calendarPresets";
import { emptyTimeline } from "./timelineModels";
import {
    collectDirectories,
    folderMatches,
    ingestEvents,
    parseFrontmatterDate,
    tagMatches,
    vaultRelative,
} from "./timelineIngestion";

const cal = compileCalendar(GREGORIAN);

describe("parseFrontmatterDate", () => {
    it("parses full dates with 1-based months", () => {
        // March 12 → engine-internal month index 2.
        expect(parseFrontmatterDate("1042-03-12", cal)).toEqual({
            year: 1042,
            month: 2,
            day: 12,
        });
    });

    it("parses partial precision", () => {
        expect(parseFrontmatterDate("1042", cal)).toEqual({ year: 1042 });
        expect(parseFrontmatterDate("1042-03", cal)).toEqual({
            year: 1042,
            month: 2,
        });
    });

    it("coerces YAML numbers", () => {
        expect(parseFrontmatterDate(1042, cal)).toEqual({ year: 1042 });
    });

    it("accepts negative years and single-digit fields", () => {
        expect(parseFrontmatterDate("-55-3-9", cal)).toEqual({
            year: -55,
            month: 2,
            day: 9,
        });
    });

    it("accepts day >99 when the calendar's month is long enough", () => {
        const def = structuredClone(GREGORIAN);
        def.id = "longmonth";
        def.months = [{ name: "Deepwinter", days: 150 }];
        def.leapRules = [];
        const long = compileCalendar(def);
        expect(parseFrontmatterDate("5-1-150", long)).toEqual({
            year: 5,
            month: 0,
            day: 150,
        });
        expect(parseFrontmatterDate("5-1-151", long)).toBeNull();
    });

    it("rejects out-of-range months and days via the calendar", () => {
        expect(parseFrontmatterDate("1042-13-01", cal)).toBeNull();
        expect(parseFrontmatterDate("1042-02-30", cal)).toBeNull();
        // 2024 is a Gregorian leap year; 2023 is not.
        expect(parseFrontmatterDate("2024-02-29", cal)).not.toBeNull();
        expect(parseFrontmatterDate("2023-02-29", cal)).toBeNull();
    });

    it("rejects garbage, empties, and year zero (Gregorian has none)", () => {
        expect(parseFrontmatterDate("March 3rd", cal)).toBeNull();
        expect(parseFrontmatterDate("1042-03-12T10:00", cal)).toBeNull();
        expect(parseFrontmatterDate("", cal)).toBeNull();
        expect(parseFrontmatterDate(null, cal)).toBeNull();
        expect(parseFrontmatterDate(undefined, cal)).toBeNull();
        expect(parseFrontmatterDate("0-01-01", cal)).toBeNull();
    });
});

function page(over: Partial<DatedPageInfo>): DatedPageInfo {
    return {
        title: "Battle of Redford",
        path: "/vault/History/Battle of Redford.md",
        tags: ["history/battles"],
        date: "1042-03-12",
        dateEnd: null,
        calendar: null,
        ...over,
    };
}

/** A timeline whose first lane sources tag `history`. */
function sourcedTimeline() {
    const t = emptyTimeline("t", "gregorian");
    t.lanes[0].sources = [{ tag: "history", folder: null }];
    return t;
}

describe("matching", () => {
    it("tagMatches is hierarchical and case-insensitive", () => {
        expect(tagMatches("history", ["history/battles"])).toBe(true);
        expect(tagMatches("History/Battles", ["history/battles"])).toBe(true);
        expect(tagMatches("history/battles", ["history"])).toBe(false);
        expect(tagMatches("hist", ["history"])).toBe(false); // no partial segment
    });

    it("folderMatches is a segment-aware prefix", () => {
        expect(folderMatches("History", "History/Battle.md")).toBe(true);
        expect(folderMatches("His", "History/Battle.md")).toBe(false);
        expect(folderMatches("History/", "History/Battle.md")).toBe(true);
        expect(folderMatches("History", "Other/Battle.md")).toBe(false);
    });

    it("vaultRelative strips the vault prefix", () => {
        expect(vaultRelative("/vault/History/A.md", "/vault")).toBe(
            "History/A.md",
        );
        expect(vaultRelative("/vault/History/A.md", "/vault/")).toBe(
            "History/A.md",
        );
    });

    it("collectDirectories returns vault-relative folder paths, sorted", () => {
        const tree: FileNode[] = [
            {
                name: "History",
                path: "/vault/History",
                file_type: "Directory",
                children: [
                    {
                        name: "Wars",
                        path: "/vault/History/Wars",
                        file_type: "Directory",
                        children: [],
                    },
                    {
                        name: "a.md",
                        path: "/vault/History/a.md",
                        file_type: "Markdown",
                    },
                ],
            },
        ];
        expect(collectDirectories(tree, "/vault")).toEqual([
            "History",
            "History/Wars",
        ]);
    });
});

describe("ingestEvents", () => {
    it("ingests matching pages as read-only events in the sourcing lane", () => {
        const t = sourcedTimeline();
        const cal = compileCalendar(GREGORIAN);
        const r = ingestEvents(cal, t, [page({})], "/vault");
        expect(r.events).toHaveLength(1);
        const e = r.events[0];
        expect(e.id).toBe("page:/vault/History/Battle of Redford.md");
        expect(e.laneId).toBe(t.lanes[0].id);
        expect(e.title).toBe("Battle of Redford");
        expect(e.pageLink).toBe("Battle of Redford");
        expect(e.start).toEqual({ year: 1042, month: 2, day: 12 });
        expect(e.end).toBeNull();
        expect(e.ingested).toBe(true);
        expect(r.skippedPaths).toEqual([]);
    });

    it("parses date-end into a span", () => {
        const t = sourcedTimeline();
        const cal = compileCalendar(GREGORIAN);
        const r = ingestEvents(
            cal,
            t,
            [page({ dateEnd: "1042-04-02" })],
            "/vault",
        );
        expect(r.events[0].end).toEqual({ year: 1042, month: 3, day: 2 });
    });

    it("requires every filled condition within a row (AND)", () => {
        const t = emptyTimeline("t", "gregorian");
        // Tag matches the page but the folder doesn't → the row fails.
        t.lanes[0].sources = [{ tag: "history", folder: "Other" }];
        const cal = compileCalendar(GREGORIAN);
        const r = ingestEvents(cal, t, [page({})], "/vault");
        expect(r.events).toHaveLength(0);
    });

    it("ORs rows and gives a page to the first matching lane only", () => {
        const t = sourcedTimeline();
        // A non-matching extra row must not block the matching first row.
        t.lanes[0].sources.push({ tag: null, folder: "Elsewhere" });
        // A second lane that would also match — must NOT receive the page.
        t.lanes.push({
            id: "l2",
            name: "Also",
            color: null,
            collapsed: false,
            sources: [{ tag: "history", folder: null }],
        });
        const cal = compileCalendar(GREGORIAN);
        const r = ingestEvents(cal, t, [page({})], "/vault");
        expect(r.events).toHaveLength(1);
        expect(r.events[0].laneId).toBe(t.lanes[0].id); // first lane wins
    });

    it("skips pages declaring a different calendar, silently", () => {
        const t = sourcedTimeline();
        const cal = compileCalendar(GREGORIAN);
        const r = ingestEvents(
            cal,
            t,
            [page({ calendar: "valdrun" })],
            "/vault",
        );
        expect(r.events).toHaveLength(0);
        expect(r.skippedPaths).toEqual([]); // mismatch is not an error
    });

    it("counts unparseable dates as skipped", () => {
        const t = sourcedTimeline();
        const cal = compileCalendar(GREGORIAN);
        const r = ingestEvents(
            cal,
            t,
            [page({ date: "the third age" })],
            "/vault",
        );
        expect(r.events).toHaveLength(0);
        expect(r.skippedPaths).toEqual(["History/Battle of Redford.md"]);
    });

    it("manual events win: a linked page is not ingested anywhere", () => {
        const t = sourcedTimeline();
        t.events.push({
            id: "manual1",
            laneId: t.lanes[0].id,
            title: "My battle event",
            start: { year: 1000 },
            end: null,
            circa: false,
            description: "",
            pageLink: "battle of redford", // case-insensitive match
            color: null,
        });
        const cal = compileCalendar(GREGORIAN);
        const r = ingestEvents(cal, t, [page({})], "/vault");
        expect(r.events).toHaveLength(0);
        expect(r.skippedPaths).toEqual([]);
    });
});
