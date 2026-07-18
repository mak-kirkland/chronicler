/**
 * @file Frontmatter date ingestion: turns dated notes into read-only
 * timeline events. Pure functions over the compiled-calendar engine —
 * the backend ships raw strings and never parses dates.
 */
import type { DatedPageInfo, FileNode } from "$lib/bindings";
import type { CompiledCalendar } from "$lib/calendar";
import type { TimelineDate } from "$lib/calendarModels";
import type {
    TimelineData,
    TimelineEvent,
    TimelineLane,
} from "$lib/timelineModels";

/** `YYYY[-MM[-DD]]`; month/day are 1-based as humans write them. */
const DATE_RE = /^(-?\d+)(?:-(\d+)(?:-(\d+))?)?$/;

export function parseFrontmatterDate(
    raw: string | number | null | undefined,
    cal: CompiledCalendar,
): TimelineDate | null {
    if (raw == null) return null;
    const match = DATE_RE.exec(String(raw).trim());
    if (!match) return null;
    const year = Number(match[1]);
    if (!Number.isSafeInteger(year)) return null;
    if (year === 0 && !cal.def.hasYearZero) return null;
    if (match[2] == null) return { year };
    const month = Number(match[2]) - 1; // frontmatter is 1-based
    if (month < 0 || month >= cal.def.months.length) return null;
    if (match[3] == null) return { year, month };
    const day = Number(match[3]);
    if (day < 1 || day > cal.daysInMonth(year, month)) return null;
    return { year, month, day };
}

export type IngestedEvent = TimelineEvent & { ingested: true };

export interface IngestionResult {
    events: IngestedEvent[];
    /** Vault-relative paths of matched pages whose date didn't parse. */
    skippedPaths: string[];
}

/** Hierarchical tag match: `history` matches `history` and `history/…`. */
export function tagMatches(filter: string, pageTags: string[]): boolean {
    const f = filter.toLowerCase();
    return pageTags.some((t) => {
        const tag = t.toLowerCase();
        return tag === f || tag.startsWith(f + "/");
    });
}

/** Segment-aware folder prefix: `His` must not match `History/`. */
export function folderMatches(filter: string, relPath: string): boolean {
    const f = filter.toLowerCase().replace(/\\/g, "/").replace(/\/+$/, "");
    if (f === "") return false;
    return relPath
        .toLowerCase()
        .replace(/\\/g, "/")
        .startsWith(f + "/");
}

export function vaultRelative(path: string, vaultPath: string): string {
    const p = path.replace(/\\/g, "/");
    const v = vaultPath.replace(/\\/g, "/").replace(/\/+$/, "");
    return p.startsWith(v + "/") ? p.slice(v.length + 1) : p;
}

/** Vault-relative folder paths from the file tree, sorted, for pickers. */
export function collectDirectories(
    nodes: FileNode[],
    vaultPath: string,
): string[] {
    const out: string[] = [];
    const walk = (list: FileNode[]) => {
        for (const node of list) {
            if (node.children === undefined) continue; // not a directory
            out.push(vaultRelative(node.path, vaultPath));
            walk(node.children);
        }
    };
    walk(nodes);
    return out.sort();
}

function laneMatches(
    lane: TimelineLane,
    page: DatedPageInfo,
    relPath: string,
): boolean {
    return lane.sources.some((s) => {
        if (s.tag !== null && !tagMatches(s.tag, page.tags)) return false;
        if (s.folder !== null && !folderMatches(s.folder, relPath))
            return false;
        return s.tag !== null || s.folder !== null;
    });
}

/**
 * Derives read-only events from dated pages. Never mutates the timeline;
 * results are merged at render time and never persisted.
 */
export function ingestEvents(
    cal: CompiledCalendar,
    timeline: TimelineData,
    datedPages: DatedPageInfo[],
    vaultPath: string,
): IngestionResult {
    const events: IngestedEvent[] = [];
    const skippedPaths: string[] = [];
    // Manual wins: hand-placed linked events suppress ingestion of their page.
    const linkedTitles = new Set(
        timeline.events
            .filter((e) => e.pageLink !== null)
            .map((e) => e.pageLink!.toLowerCase()),
    );
    for (const page of datedPages) {
        if (linkedTitles.has(page.title.toLowerCase())) continue;
        if (page.calendar !== null && page.calendar !== timeline.calendarId) {
            continue; // different calendar: not ingested, not an error
        }
        const relPath = vaultRelative(page.path, vaultPath);
        const lane = timeline.lanes.find((l) => laneMatches(l, page, relPath));
        if (!lane) continue;
        const start = parseFrontmatterDate(page.date, cal);
        const end =
            page.dateEnd !== null
                ? parseFrontmatterDate(page.dateEnd, cal)
                : null;
        if (start === null || (page.dateEnd !== null && end === null)) {
            skippedPaths.push(relPath);
            continue;
        }
        events.push({
            id: `page:${page.path}`,
            laneId: lane.id,
            title: page.title,
            start,
            end,
            circa: false,
            description: "",
            pageLink: page.title,
            color: null,
            ingested: true,
        });
    }
    return { events, skippedPaths };
}
