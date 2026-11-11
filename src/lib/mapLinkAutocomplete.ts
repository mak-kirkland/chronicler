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

/** How many whitespace characters `s` starts with. */
function leadingSpace(s: string): number {
    return s.length - s.trimStart().length;
}

/**
 * Reads the text between `[[` and the caret (`inner`) as a map link being
 * typed. `nameStart` / `placeStart` are offsets into `inner` where the part
 * to complete begins, past any spaces (which links ignore). Null for a page
 * link.
 */
export function mapLinkQuery(inner: string): MapLinkQuery | null {
    const restStart = leadingSpace(inner) + MAP_LINK_PREFIX.length;
    const prefix = inner.slice(restStart - MAP_LINK_PREFIX.length, restStart);
    if (prefix.toLowerCase() !== MAP_LINK_PREFIX) return null;
    if (inner.includes("|")) return { kind: "alias" };
    const rest = inner.slice(restStart);
    const hash = rest.indexOf("#");
    if (hash === -1) {
        return {
            kind: "map",
            name: rest.trim(),
            nameStart: restStart + leadingSpace(rest),
        };
    }
    const place = rest.slice(hash + 1);
    return {
        kind: "place",
        map: rest.slice(0, hash).trim(),
        place: place.trim(),
        placeStart: restStart + hash + 1 + leadingSpace(place),
    };
}

/**
 * Puts a chosen map `name` in place of the name being typed, from `start`.
 * The caret ends up after the name, still inside the link, so a `#place`
 * can follow. In a link that's already closed, the rest of the name after
 * the caret (up to `#`, `|` or `]`) is replaced too; an unclosed link gets
 * its `]]`, and the text after it is left alone.
 */
export function applyMapNameCompletion(
    text: string,
    caret: number,
    start: number,
    name: string,
): { text: string; caret: number } {
    const after = text.slice(caret);
    // Closed when a `]]` comes before the next `[[` or line break.
    const closed = /^[^\n]*?\]\]/.test(after.split("[[")[0]);
    const tail = closed ? (after.match(/^[^#|\]\n]*/)?.[0].length ?? 0) : 0;
    return {
        text:
            text.slice(0, start) +
            name +
            (closed ? "" : "]]") +
            text.slice(caret + tail),
        caret: start + name.length,
    };
}
