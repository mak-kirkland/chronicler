import type { EditorView } from "@codemirror/view";

/**
 * A helper function to wrap selected text with a given prefix and suffix.
 * If the text is already wrapped, it unwraps it.
 * It preserves the selection, expanding it to include the markers when wrapping.
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

    const isAlreadyWrapped =
        selection.startsWith(prefix) && selection.endsWith(suffix);

    // This special condition handles the ambiguity between bold `**` and italic `*`.
    // It prevents the function from unwrapping italics when it sees bold text.
    // Instead, it ensures the text gets wrapped with italics, nesting the formats.
    const isAddingItalicToBold =
        prefix === "*" &&
        selection.startsWith("**") &&
        !selection.startsWith("***") &&
        selection.endsWith("**") &&
        !selection.endsWith("***");

    if (isAlreadyWrapped && !isAddingItalicToBold) {
        // --- UNWRAP ---
        const unwrapped = selection.slice(
            prefix.length,
            selection.length - suffix.length,
        );
        // Calculate the selection range for the unwrapped text
        const newSelectionFrom = from;
        const newSelectionTo = to - prefix.length - suffix.length;
        view.dispatch({
            changes: { from, to, insert: unwrapped },
            // Select only the unwrapped text
            selection: { anchor: newSelectionFrom, head: newSelectionTo },
        });
    } else {
        // --- WRAP ---
        const wrapped = `${prefix}${selection}${suffix}`;
        // Calculate the selection range to include the markers
        const newSelectionFrom = from;
        const newSelectionTo = to + prefix.length + suffix.length;
        view.dispatch({
            changes: { from, to, insert: wrapped },
            // Select the entire wrapped text including markers
            selection: { anchor: newSelectionFrom, head: newSelectionTo },
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
            // Maintain cursor position relative to the start of the line content
            selection: {
                anchor: from - existingHeading[0].length + prefix.length,
            },
        });
    } else {
        // Add a new heading
        view.dispatch({
            changes: { from: line.from, insert: prefix },
            // Place cursor right after the newly inserted prefix
            selection: { anchor: line.from + prefix.length },
        });
    }
}
