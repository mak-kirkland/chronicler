/**
 * @file Asks a map that is already open to fly to a place.
 *
 * A `[[map:Name#Place]]` link or a page's "View on Map" clicked in one pane
 * of a split view, while the other pane shows that map, doesn't navigate: the
 * open map flies there instead. `openMapAt` posts a request here; the
 * `MapView` whose tab id matches acts on it.
 */

import { writable } from "svelte/store";
import type { MapPlace } from "./tabs";

export interface MapFocusRequest {
    /** The tab whose map should fly. */
    tabId: string;
    /** Where to land (see MapPlace), or null for the opening view. */
    place: MapPlace | null;
}

/**
 * The latest request. Each one is a new object, so the same place asked
 * for twice still notifies.
 */
export const mapFocusRequest = writable<MapFocusRequest | null>(null);

/** Asks the map shown in tab `tabId` to fly to `place`. */
export function requestMapFocus(tabId: string, place: MapPlace | null): void {
    mapFocusRequest.set({ tabId, place });
}
