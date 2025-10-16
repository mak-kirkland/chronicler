import type { EditorView } from "@codemirror/view";

/**
 * A helper function to wrap selected text with a given prefix and suffix.
 * If the text is already wrapped, it unwraps it.
 * @param view The CodeMirror EditorView instance.
 * @param prefix The string to add before the selection (e.g., "**").
 * @param suffix The string to add after the selection (e.g., "**").
 */
function toggleBlock(
    view: EditorView,
    prefix: string,
    suffix: string = prefix,
) {
    const { from, to } = view.state.selection.main;
    const selection = view.state.sliceDoc(from, to);

    // Check if the selection is already wrapped
    if (selection.startsWith(prefix) && selection.endsWith(suffix)) {
        // Unwrap the text
        const unwrapped = selection.slice(
            prefix.length,
            selection.length - suffix.length,
        );
        view.dispatch({
            changes: { from, to, insert: unwrapped },
        });
    } else {
        // Wrap the text
        const wrapped = `${prefix}${selection}${suffix}`;
        view.dispatch({
            changes: { from, to, insert: wrapped },
            selection: { anchor: from + prefix.length },
        });
    }
}

export function toggleBold(view: EditorView) {
    toggleBlock(view, "**");
}

export function toggleItalic(view: EditorView) {
    toggleBlock(view, "*");
}

export function toggleStrikethrough(view: EditorView) {
    toggleBlock(view, "~~");
}

export function addHeading(view: EditorView, level: number) {
    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const prefix = "#".repeat(level) + " ";

    // Check if the line already starts with a heading
    const existingHeading = line.text.match(/^#+\s/);
    if (existingHeading) {
        // Replace the existing heading
        view.dispatch({
            changes: {
                from: line.from,
                to: line.from + existingHeading[0].length,
                insert: prefix,
            },
        });
    } else {
        // Add a new heading
        view.dispatch({
            changes: { from: line.from, insert: prefix },
            selection: { anchor: line.from + prefix.length },
        });
    }
}
