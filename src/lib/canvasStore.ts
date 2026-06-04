/**
 * @file Loading, caching, and safe serialized updating of `.canvas` files.
 * The machinery lives in documentStore.ts, shared with timelineStore.ts; this
 * file binds it to the canvas type and gives it canvas-specific names.
 */
import { getCanvasData } from "$lib/commands";
import { MAX_CACHED_CANVASES } from "$lib/config";
import { createDocumentStore, type CachedDocument } from "$lib/documentStore";
import type { CanvasData } from "$lib/canvasModels";

export type CachedCanvas = CachedDocument<CanvasData>;

const store = createDocumentStore<CanvasData>({
    noun: "canvas",
    context: "canvasStore",
    maxCached: MAX_CACHED_CANVASES,
    read: (path) => getCanvasData(path),
});

export const loadedCanvases = store.loaded;
export const externalReloads = store.externalReloads;
export const handleExternalChanges = store.handleExternalChanges;
export const loadCanvasData = store.load;
export const registerCanvas = store.register;
export const getCanvasFromCache = store.fromCache;
export const updateCanvas = store.update;
