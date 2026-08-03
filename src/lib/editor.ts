import {
    Decoration,
    EditorView,
    WidgetType,
    type DecorationSet,
} from "@codemirror/view";
import {
    StateField,
    type EditorState,
    type Extension,
    type Range,
} from "@codemirror/state";

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
        // Check if the selection was empty (a collapsed cursor)
        if (from === to) {
            // Insert the markers and place the cursor in the middle
            view.dispatch({
                changes: { from, to, insert: wrapped },
                selection: { anchor: from + prefix.length },
            });
        } else {
            // Text was selected, so wrap it and select the whole new block
            const newSelectionFrom = from;
            const newSelectionTo = to + prefix.length + suffix.length;
            view.dispatch({
                changes: { from, to, insert: wrapped },
                // Select the entire wrapped text including markers
                selection: { anchor: newSelectionFrom, head: newSelectionTo },
            });
        }
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

/**
 * Inserts an image wikilink `![[filename]]` at the cursor, replacing any
 * current selection, then refocuses the editor.
 */
export function insertImageRef(view: EditorView, filename: string) {
    const ref = `![[${filename}]]`;
    const { from, to } = view.state.selection.main;
    view.dispatch({
        changes: { from, to, insert: ref },
        selection: { anchor: from + ref.length },
    });
    view.focus();
}

// --- Frontmatter block ---------------------------------------------------
//
// The infobox is driven entirely by the YAML at the top of a page, but in the
// editor that YAML looked like any other text — the most structured thing on
// the page was also the most invisible. These decorations draw it as a bordered
// card with its own heading and a route into the visual editor, without
// changing a single character of the document.

/**
 * Frontmatter is a header, not a document. Capping the search keeps the
 * unterminated case — the window between typing `---` and typing its closing
 * fence — from walking the whole file on every keystroke.
 */
const MAX_FRONTMATTER_LINES = 200;

/**
 * Where the leading `---` … `---` block starts and ends, if there is one.
 *
 * Deliberately mirrors `extract_frontmatter` in `src-tauri/src/parser.rs`: the
 * opening fence must be exactly `---` at the very start of the document with no
 * leading whitespace, the closing fence is any line beginning with `---`, and
 * `...` is *not* a terminator. Drawing a card around text the backend doesn't
 * treat as frontmatter is worse than drawing no card at all — "Edit as form"
 * would then open the infobox editor against nothing.
 */
function frontmatterRange(
    state: EditorState,
): { from: number; to: number } | null {
    if (state.doc.lines < 2) return null;

    // CodeMirror keeps a trailing \r in the line text for CRLF documents; the
    // Rust side strips it too.
    const stripCr = (t: string) => (t.endsWith("\r") ? t.slice(0, -1) : t);

    const first = state.doc.line(1);
    if (stripCr(first.text) !== "---") return null;

    const lastLine = Math.min(state.doc.lines, MAX_FRONTMATTER_LINES);
    for (let i = 2; i <= lastLine; i++) {
        const line = state.doc.line(i);
        if (stripCr(line.text).startsWith("---")) {
            return { from: first.from, to: line.to };
        }
    }

    // An unterminated block is a document being typed, not a frontmatter block.
    return null;
}

/** The card's heading row: a label and a way out to the form editor. */
class FrontmatterHeaderWidget extends WidgetType {
    constructor(
        readonly label: string,
        readonly actionLabel: string,
        readonly onAction: () => void,
    ) {
        super();
    }

    eq(other: WidgetType): boolean {
        return (
            other instanceof FrontmatterHeaderWidget &&
            other.label === this.label &&
            other.actionLabel === this.actionLabel
        );
    }

    toDOM(): HTMLElement {
        const wrap = document.createElement("div");
        wrap.className = "cm-fm-header";

        const label = document.createElement("span");
        label.className = "eyebrow";
        label.textContent = this.label;

        const action = document.createElement("button");
        action.type = "button";
        action.className = "link-button cm-fm-action";
        action.textContent = this.actionLabel;
        // Without this the editor takes focus back on mousedown and the click
        // never lands on the button.
        action.addEventListener("mousedown", (e) => e.preventDefault());
        action.addEventListener("click", (e) => {
            e.preventDefault();
            this.onAction();
        });

        wrap.append(label, action);
        return wrap;
    }
}

function buildFrontmatterDecorations(
    state: EditorState,
    header: FrontmatterHeaderWidget,
): DecorationSet {
    const range = frontmatterRange(state);
    if (!range) return Decoration.none;

    const decorations: Range<Decoration>[] = [];

    // side: -1 puts the heading above the opening `---` rather than below it.
    decorations.push(
        Decoration.widget({ widget: header, block: true, side: -1 }).range(
            range.from,
        ),
    );

    const firstLine = state.doc.lineAt(range.from).number;
    const lastLine = state.doc.lineAt(range.to).number;

    for (let i = firstLine; i <= lastLine; i++) {
        const line = state.doc.line(i);
        decorations.push(
            Decoration.line({
                // The last line closes the box: bottom border, radius, and the
                // gap between the card and the body text.
                class: i === lastLine ? "cm-fm-line cm-fm-last" : "cm-fm-line",
            }).range(line.from),
        );

        // Wikilinks are as meaningful in a frontmatter value as in the body,
        // and YAML highlighting alone renders them as ordinary string text.
        for (const match of line.text.matchAll(/\[\[[^\]\n]+\]\]/g)) {
            const from = line.from + (match.index ?? 0);
            decorations.push(
                Decoration.mark({ class: "cm-fm-wikilink" }).range(
                    from,
                    from + match[0].length,
                ),
            );
        }
    }

    return Decoration.set(decorations, true);
}

const frontmatterTheme = EditorView.baseTheme({
    ".cm-fm-header": {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "9px 13px 7px",
        background: "var(--color-overlay-subtle)",
        borderTop: "1px solid var(--color-border-primary)",
        borderRight: "1px solid var(--color-border-primary)",
        borderLeft: "3px solid var(--color-accent-primary)",
        borderRadius: "5px 5px 0 0",
    },
    ".cm-fm-action": {
        fontSize: "0.75rem",
    },
    ".cm-fm-line": {
        background: "var(--color-overlay-subtle)",
        borderRight: "1px solid var(--color-border-primary)",
        borderLeft: "3px solid var(--color-accent-primary)",
        padding: "0 13px",
    },
    ".cm-fm-last": {
        paddingBottom: "11px",
        marginBottom: "20px",
        borderBottom: "1px solid var(--color-border-primary)",
        borderRadius: "0 0 5px 5px",
    },
    ".cm-fm-wikilink": {
        color: "var(--color-text-link)",
    },
});

export interface FrontmatterBlockOptions {
    /** Small-caps heading for the card, e.g. "Infobox fields". */
    label: string;
    /** Label for the link out to the visual editor. */
    actionLabel: string;
    /** Opens the visual infobox editor against the live document. */
    onEditAsForm: () => void;
}

/**
 * A CodeMirror extension that renders a page's leading YAML frontmatter as a
 * bordered infobox card.
 *
 * Purely decorative: the document text is untouched, so saving, undo, and
 * external edits behave exactly as they did before.
 */
export function frontmatterBlock(options: FrontmatterBlockOptions): Extension {
    const header = new FrontmatterHeaderWidget(
        options.label,
        options.actionLabel,
        options.onEditAsForm,
    );

    const field = StateField.define<DecorationSet>({
        create: (state) => buildFrontmatterDecorations(state, header),
        update: (decorations, tr) =>
            tr.docChanged
                ? buildFrontmatterDecorations(tr.state, header)
                : decorations,
        provide: (f) => EditorView.decorations.from(f),
    });

    return [field, frontmatterTheme];
}
