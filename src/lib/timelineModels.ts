/**
 * @file Types + parsing for `.timeline` files. `parseTimelineData` is the
 * single place raw JSON from the backend becomes a normalized TimelineData —
 * every field gets a default so components never null-check deep fields.
 * NOTE: the Rust side (models.rs TimelineConfig) parses a PARTIAL view of
 * this schema for backlink tracking; rename rewriting is JSON-value-based so
 * schema changes here do NOT require Rust changes unless they carry links.
 */
import type { TimelineDate } from "./calendarModels";

/** A per-lane ingestion filter. Within a row, all present conditions must
 *  match (AND); rows are OR'd. */
export interface LaneSource {
    tag: string | null;
    folder: string | null;
}

export interface TimelineLane {
    id: string;
    name: string;
    color: string | null;
    collapsed: boolean;
    sources: LaneSource[];
}

export interface TimelineEvent {
    id: string;
    laneId: string;
    title: string;
    start: TimelineDate;
    /** Non-null makes this a duration span. */
    end: TimelineDate | null;
    circa: boolean;
    /** Markdown; may contain [[wikilinks]]. */
    description: string;
    /** Optional wikilink target (a page title). */
    pageLink: string | null;
    color: string | null;
    /** Render-only marker for frontmatter-ingested events; never persisted
     *  (ingested events are derived per render, not stored). */
    ingested?: true;
}

export interface TimelineViewportState {
    centerSerial: number;
    daysPerPixel: number;
}

export interface TimelineData {
    version: 1;
    title: string;
    calendarId: string;
    lanes: TimelineLane[];
    events: TimelineEvent[];
    viewport: TimelineViewportState | null;
}

export function genId(): string {
    return crypto.randomUUID();
}

export function emptyTimeline(title: string, calendarId: string): TimelineData {
    return {
        version: 1,
        title,
        calendarId,
        lanes: [
            {
                id: genId(),
                name: "Events",
                color: null,
                collapsed: false,
                sources: [],
            },
        ],
        events: [],
        viewport: null,
    };
}

function normalizeDate(raw: unknown): TimelineDate {
    const o = (raw ?? {}) as Record<string, unknown>;
    const date: TimelineDate = {
        year: typeof o.year === "number" ? o.year : 1,
    };
    if (typeof o.month === "number") date.month = o.month;
    if (typeof o.day === "number") date.day = o.day;
    if (typeof o.hour === "number") date.hour = o.hour;
    if (typeof o.minute === "number") date.minute = o.minute;
    return date;
}

export function parseTimelineData(json: string): TimelineData {
    const raw = JSON.parse(json);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error("Timeline file must contain a JSON object");
    }
    if (raw.events != null && !Array.isArray(raw.events)) {
        throw new Error("Timeline 'events' must be an array");
    }
    if (raw.lanes != null && !Array.isArray(raw.lanes)) {
        throw new Error("Timeline 'lanes' must be an array");
    }

    const lanes: TimelineLane[] = (raw.lanes ?? []).map(
        (l: Record<string, unknown>) => ({
            id: typeof l.id === "string" ? l.id : genId(),
            name: typeof l.name === "string" ? l.name : "",
            color: typeof l.color === "string" ? l.color : null,
            collapsed: l.collapsed === true,
            sources: Array.isArray(l.sources)
                ? (l.sources as unknown[])
                      .filter(
                          (s): s is Record<string, unknown> =>
                              typeof s === "object" && s !== null,
                      )
                      .map((s) => ({
                          tag:
                              typeof s.tag === "string" && s.tag !== ""
                                  ? s.tag
                                  : null,
                          folder:
                              typeof s.folder === "string" && s.folder !== ""
                                  ? s.folder
                                  : null,
                      }))
                      .filter((s) => s.tag !== null || s.folder !== null)
                : [],
        }),
    );
    if (lanes.length === 0) {
        lanes.push({
            id: genId(),
            name: "Events",
            color: null,
            collapsed: false,
            sources: [],
        });
    }

    const events: TimelineEvent[] = (raw.events ?? []).map(
        (e: Record<string, unknown>) => ({
            id: typeof e.id === "string" ? e.id : genId(),
            laneId: typeof e.laneId === "string" ? e.laneId : lanes[0].id,
            title: typeof e.title === "string" ? e.title : "",
            start: normalizeDate(e.start),
            end: e.end != null ? normalizeDate(e.end) : null,
            circa: e.circa === true,
            description: typeof e.description === "string" ? e.description : "",
            pageLink: typeof e.pageLink === "string" ? e.pageLink : null,
            color: typeof e.color === "string" ? e.color : null,
        }),
    );

    const vp = raw.viewport as Record<string, unknown> | null | undefined;
    const viewport =
        vp != null &&
        typeof vp.centerSerial === "number" &&
        typeof vp.daysPerPixel === "number" &&
        vp.daysPerPixel > 0
            ? { centerSerial: vp.centerSerial, daysPerPixel: vp.daysPerPixel }
            : null;

    return {
        version: 1,
        title: typeof raw.title === "string" ? raw.title : "",
        calendarId:
            typeof raw.calendarId === "string" ? raw.calendarId : "gregorian",
        lanes,
        events,
        viewport,
    };
}
