/**
 * @file Caret-token helpers for autocompleting `[[map:Name#Place]]` links,
 * shared by the page editor (CodeMirror) and the plain-textarea editors.
 * Pure functions.
 */

/** The prefix that turns a wikilink into a map link. */
export const MAP_LINK_PREFIX = "map:";

/**
 * What a map link being typed is asking for: a map name, a place on it, or
 * nothing (its alias is being typed — no suggestions, not even page ones).
 */
export type MapLinkQuery =
    | { kind: "map"; name: string; nameStart: number }
    | { kind: "place"; map: string; place: string; placeStart: number }
    | { kind: "alias" };

/**
 * Reads the text between `[[` and the caret (`inner`) as a map link being
 * typed. `nameStart` / `placeStart` are offsets into `inner` where the part
 * to complete begins. Null for a page link.
 */
export function mapLinkQuery(inner: string): MapLinkQuery | null {
    const prefix = inner.slice(0, MAP_LINK_PREFIX.length);
    if (prefix.toLowerCase() !== MAP_LINK_PREFIX) return null;
    if (inner.includes("|")) return { kind: "alias" };
    const rest = inner.slice(MAP_LINK_PREFIX.length);
    const hash = rest.indexOf("#");
    if (hash === -1) {
        return {
            kind: "map",
            name: rest.trim(),
            nameStart: MAP_LINK_PREFIX.length,
        };
    }
    return {
        kind: "place",
        map: rest.slice(0, hash).trim(),
        place: rest.slice(hash + 1).trim(),
        placeStart: MAP_LINK_PREFIX.length + hash + 1,
    };
}

/**
 * Puts a chosen map `name` in place of the name being typed, from `start`
 * through any of it after the caret (up to `#`, `|`, `]` or a newline). The
 * link is left open, with the caret after the name, so a `#place` can follow.
 */
export function applyMapNameCompletion(
    text: string,
    caret: number,
    start: number,
    name: string,
): { text: string; caret: number } {
    const tail = text.slice(caret).match(/^[^#|\]\n]*/)?.[0].length ?? 0;
    return {
        text: text.slice(0, start) + name + text.slice(caret + tail),
        caret: start + name.length,
    };
}
