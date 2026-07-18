/**
 * @file Loading, caching, and safe serialized updating of `.timeline` files.
 * The machinery lives in documentStore.ts, shared with canvasStore.ts; this
 * file binds it to the timeline type and gives it timeline-specific names.
 */
import { getTimelineData } from "$lib/commands";
import { MAX_CACHED_TIMELINES } from "$lib/config";
import { createDocumentStore, type CachedDocument } from "$lib/documentStore";
import type { TimelineData } from "$lib/timelineModels";

export type CachedTimeline = CachedDocument<TimelineData>;

const store = createDocumentStore<TimelineData>({
    noun: "timeline",
    context: "timelineStore",
    maxCached: MAX_CACHED_TIMELINES,
    read: (path) => getTimelineData(path),
});

export const loadedTimelines = store.loaded;
export const externalReloads = store.externalReloads;
export const handleExternalChanges = store.handleExternalChanges;
export const loadTimelineData = store.load;
export const registerTimeline = store.register;
export const getTimelineFromCache = store.fromCache;
export const updateTimeline = store.update;
