/**
 * @file Caret-token helpers for lightweight [[wikilink]] autocomplete in
 * plain textareas (no CodeMirror). Pure functions; the dropdown component
 * consumes them.
 */

export interface WikilinkQuery {
    /** Index just after the opening `[[`. */
    start: number;
    /** Text between `[[` and the caret. */
    query: string;
}

export function wikilinkQueryAt(
    text: string,
    caret: number,
): WikilinkQuery | null {
    const before = text.slice(0, caret);
    const open = before.lastIndexOf("[[");
    if (open === -1) return null;
    const between = before.slice(open + 2);
    if (between.includes("]]") || between.includes("\n")) return null;
    return { start: open + 2, query: between };
}

export function applyWikilinkCompletion(
    text: string,
    caret: number,
    start: number,
    title: string,
): { text: string; caret: number } {
    const after = text.slice(caret);
    // The in-progress token may extend past the caret (the user may have
    // repositioned mid-query). Consume that tail through its closing ]]
    // when — and only when — the next delimiter after the caret is a
    // closer; a [[ or newline first means the ]] belongs elsewhere.
    const close = after.indexOf("]]");
    const open = after.indexOf("[[");
    const newline = after.indexOf("\n");
    const closes =
        close !== -1 &&
        (open === -1 || close < open) &&
        (newline === -1 || close < newline);
    const rest = closes ? after.slice(close + 2) : after;
    return {
        text: text.slice(0, start) + title + "]]" + rest,
        caret: start + title.length + 2,
    };
}
