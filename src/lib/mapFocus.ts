/**
 * @file Asks a map that is already open to fly to a place.
 *
 * A `[[map:Name#Place]]` link clicked in one pane of a split view, while the
 * other pane shows that map, doesn't navigate: the open map flies there
 * instead. The link handler posts a request here; the `MapView` whose tab id
 * matches acts on it.
 */

import { writable } from "svelte/store";

export interface MapFocusRequest {
    /** The tab whose map should fly. */
    tabId: string;
    /** The pin or region label to land on, or null for the opening view. */
    place: string | null;
    /** Increases with every request, so the same place can be asked twice. */
    seq: number;
}

export const mapFocusRequest = writable<MapFocusRequest | null>(null);

let seq = 0;

/** Asks the map shown in tab `tabId` to fly to `place`. */
export function requestMapFocus(tabId: string, place: string | null): void {
    seq += 1;
    mapFocusRequest.set({ tabId, place, seq });
}
