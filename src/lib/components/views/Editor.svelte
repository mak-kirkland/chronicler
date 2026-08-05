<script lang="ts">
    import { defaultKeymap } from "@codemirror/commands";
    import Codemirror from "svelte-codemirror-editor";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { yamlFrontmatter } from "@codemirror/lang-yaml";
    import { EditorView, keymap } from "@codemirror/view";
    import { Prec, Compartment } from "@codemirror/state";
    import {
        HighlightStyle,
        syntaxHighlighting,
        syntaxTree,
    } from "@codemirror/language";
    import { tags as t } from "@lezer/highlight";
    import {
        acceptCompletion,
        autocompletion,
        type CompletionContext,
        type CompletionResult,
        type Completion,
        closeCompletion,
        startCompletion,
    } from "@codemirror/autocomplete";
    import { get } from "svelte/store";
    import {
        allFileTitles,
        allImageFiles,
        tags as worldTags,
    } from "$lib/worldStore";
    import {
        toggleBold,
        toggleItalic,
        frontmatterBlock,
        wikilinkHighlight,
    } from "$lib/editor";
    import { effectiveBindings } from "$lib/keybindingStore";
    import { comboToCodeMirror } from "$lib/keybindingUtils";
    import type { EditorCommandId } from "$lib/keybindingRegistry";
    import { pasteImageFromClipboard } from "$lib/imageInsert";
    import EditorToolbar from "$lib/components/views/EditorToolbar.svelte";
    import { t as tr } from "$lib/i18n";
    import { openModal, closeModal } from "$lib/modalStore";
    import InfoboxEditorModal from "$lib/components/infobox/InfoboxEditorModal.svelte";

    let {
        content = $bindable(),
        editorView = $bindable(),
        pageName = "",
        pagePath = "",
        isActive = true,
        shouldFocus = false,
        showPaneHeader = false,
    } = $props<{
        content?: string;
        /** Exposed so the page bar can drive undo/redo without a second history. */
        editorView?: EditorView | undefined;
        pageName?: string;
        pagePath?: string;
        isActive?: boolean;
        /** True while this pane is in an edit mode. Boolean so the effect below
         *  only re-runs on the actual false→true edge (entering edit mode). */
        shouldFocus?: boolean;
        /** Label the pane. Only earns its 30px when there are two panes. */
        showPaneHeader?: boolean;
    }>();
    let editor: EditorView | undefined = $state();

    // Mirror the local instance out to the parent rather than renaming the
    // local: everything below already refers to `editor`, and a bindable prop
    // read by a dozen effects is harder to follow than one assignment.
    $effect(() => {
        editorView = editor;
    });

    // --- Pane meta ---
    // Where you are and how much there is, in the strip above the text.
    let cursorLine = $state(1);

    const wordCount = $derived(
        ((content ?? "") as string).split(/\s+/).filter(Boolean).length,
    );

    const paneMeta = $derived(
        $tr("editor.lineAndWords", {
            line: cursorLine,
            words: wordCount.toLocaleString(),
        }),
    );

    // One action, two independent triggers below. Kept as two effects on
    // purpose: a single `isActive || shouldFocus` condition would short-circuit
    // (so `shouldFocus` wouldn't even be tracked while `isActive` held) and
    // would re-fire when `isActive` went true→false, focusing a pane that had
    // just been hidden.
    function measureAndFocus() {
        editor?.requestMeasure();
        editor?.focus();
    }

    // The tab became visible again: it was display:none, so it has no geometry
    // to lay out against and has lost focus.
    $effect(() => {
        if (isActive) measureAndFocus();
    });

    // This pane entered an edit mode. Fires on the false→true edge, since that's
    // the only time `shouldFocus` changes — and nothing here reads state it also
    // writes, so there's no loop. Driven by THIS pane's mode rather than its
    // visibility, so the two editors of a split don't fight over focus.
    $effect(() => {
        if (shouldFocus) measureAndFocus();
    });

    // Re-measure whenever the editor's own box changes width/height — e.g. when
    // the view is split 50/50 (which halves this pane without toggling
    // `isActive`) or the sidebar opens. ResizeObserver fires on first observe,
    // so the initial geometry is covered too.
    $effect(() => {
        if (!editor) return;
        const ro = new ResizeObserver(() => editor?.requestMeasure());
        ro.observe(editor.dom);
        return () => ro.disconnect();
    });

    /**
     * Opens the visual Infobox Editor modal using the CURRENT content in memory.
     * This avoids the data-loss race condition.
     */
    function handleInfoboxClick() {
        if (!content) return;

        openModal({
            component: InfoboxEditorModal,
            props: {
                onClose: closeModal,
                initialContent: content, // Pass current editor content
                onSave: (newContent: string) => {
                    // Update content immediately in memory
                    // This triggers reactivity -> updates Editor view -> triggers autosave in FileView
                    content = newContent;
                },
            },
        });
    }

    /**
     * A custom CodeMirror completion source that provides suggestions for links and tags.
     */
    function customCompletions(
        context: CompletionContext,
    ): CompletionResult | null {
        // Check for [[wikilink]] completion trigger
        const linkMatch = context.matchBefore(/\[\[([^\]]*)$/);
        if (linkMatch) {
            // Check if the link is preceded by a '!' indicating an image link
            const isImageLink =
                context.state.sliceDoc(linkMatch.from - 1, linkMatch.from) ===
                "!";

            const optionsSource = isImageLink
                ? get(allImageFiles)
                : get(allFileTitles);

            const rawQuery = linkMatch.text.slice(2); // Remove '[['
            const query = rawQuery.toLowerCase();

            // Custom apply function shared by all link completions
            const applyLink = (
                view: EditorView,
                completion: Completion,
                from: number,
                to: number,
            ) => {
                view.dispatch({
                    changes: {
                        from,
                        to,
                        insert: `${completion.label}`,
                    },
                    selection: {
                        anchor: from + completion.label.length + 2,
                    },
                });
            };

            // If no option matches the query, show a "Create" fallback instead
            const hasMatches =
                !rawQuery.trim() ||
                optionsSource.some((label) =>
                    label.toLowerCase().includes(query),
                );

            if (!hasMatches) {
                return {
                    from: linkMatch.from + 2,
                    options: [
                        {
                            label: rawQuery,
                            displayLabel: $tr("editor.createOption", {
                                name: rawQuery,
                            }),
                            type: "keyword",
                            apply: applyLink,
                        },
                    ],
                    filter: false,
                };
            }

            // Let CodeMirror's built-in filter handle ranking
            // (exact > prefix > substring) and fuzzy matching.
            return {
                from: linkMatch.from + 2,
                options: optionsSource.map((label) => ({
                    label,
                    type: isImageLink ? "image" : "link",
                    apply: applyLink,
                })),
                filter: true,
            };
        }

        // --- 2. FRONTMATTER TAG LOGIC ---
        const line = context.state.doc.lineAt(context.pos);
        const tagLineMatch = line.text.trim().match(/^tags:\s*\[(.*?)\]/);

        // We only want to trigger for tags if we are on a `tags:` line inside the brackets
        if (
            tagLineMatch &&
            context.pos >= line.from + line.text.indexOf("[") + 1 &&
            context.pos <= line.from + line.text.lastIndexOf("]")
        ) {
            const tagMatch = context.matchBefore(/\w*$/);
            if (tagMatch) {
                const allTags = get(worldTags);
                return {
                    from: tagMatch.from,
                    options: allTags.map(([tag]) => ({
                        label: tag,
                        type: "keyword",
                    })),
                    filter: true,
                };
            }
        }

        return null;
    }

    // --- CODEMIRROR CONFIGURATION ---

    /**
     * Handles the Shift-Enter keypress.
     * If the user is inside a wikilink, it forces the completion to close
     * and jumps the cursor past the closing brackets.
     */
    function forceWikilinkCompletion(view: EditorView): boolean {
        const { state } = view;
        const { from, to } = state.selection.main;

        // 1. Get the current line content up to the cursor
        const line = state.doc.lineAt(from);
        const textBefore = state.sliceDoc(line.from, from);

        // 2. Check if we are currently typing inside a wikilink
        const match = textBefore.match(/\[\[([^\]]*)$/);

        if (match) {
            // 3. Force close the autocomplete dropdown
            closeCompletion(view);

            // 4. Move cursor 2 positions forward (past the ]])
            view.dispatch({
                selection: { anchor: to + 2 },
            });

            return true; // Stop default behavior (newline)
        }

        return false; // Let other handlers (like newline) proceed
    }

    /**
     * Custom handler for '[' to force bracket closing inside strings (e.g. YAML frontmatter).
     * The standard closeBrackets extension typically skips strings, which prevents
     * automatic closing of wikilinks like "[[...]]" inside frontmatter quotes.
     */
    function handleLeftBracket(view: EditorView): boolean {
        const { state } = view;
        const range = state.selection.main;
        if (!range.empty) return false;

        const tree = syntaxTree(state);
        const node = tree.resolveInner(range.head, -1);

        // If we are in a string context (YAML or Code), force the pair.
        // We check for "String" or "Quote" in the node name to catch various string types.
        if (node.name.includes("String") || node.name.includes("Quote")) {
            view.dispatch({
                changes: { from: range.head, insert: "[]" },
                selection: { anchor: range.head + 1 },
            });
            // Force completion to trigger immediately after insertion
            startCompletion(view);
            return true;
        }
        return false;
    }

    // Rebindable Chronicler editor commands, keyed by their registry action id.
    // The combos themselves come from the keybinding store (see buildKeymap).
    const editorCommandRuns: Record<
        EditorCommandId,
        (view: EditorView) => boolean
    > = {
        editorBold: (view) => {
            toggleBold(view);
            return true;
        },
        editorItalic: (view) => {
            toggleItalic(view);
            return true;
        },
        editorForceWikilink: forceWikilinkCompletion,
        editorAcceptCompletion: acceptCompletion,
    };

    // A compartment lets us swap the keymap live when the user rebinds a
    // shortcut, without tearing down and rebuilding the whole editor.
    const keybindingCompartment = new Compartment();

    /**
     * Builds the editor keymap from the current effective bindings. Rebindable
     * commands come from the store; the literal "[" auto-pair handler (editor
     * behavior, not a user-facing shortcut) and CodeMirror's defaultKeymap are
     * always present.
     */
    function buildKeymap(bindings: Record<string, string[]>) {
        const custom = Object.entries(editorCommandRuns).flatMap(([id, run]) =>
            (bindings[id] ?? []).map((combo) => ({
                key: comboToCodeMirror(combo),
                run,
            })),
        );
        return Prec.highest(
            keymap.of([
                ...custom,
                { key: "[", run: handleLeftBracket },
                ...defaultKeymap,
            ]),
        );
    }

    // Re-apply the keymap whenever the user's bindings change.
    $effect(() => {
        const bindings = $effectiveBindings;
        if (editor) {
            editor.dispatch({
                effects: keybindingCompartment.reconfigure(
                    buildKeymap(bindings),
                ),
            });
        }
    });

    /**
     * 1. EDITOR UI THEME
     * Handles the "shell" of the editor: gutters, background, selection, and cursor.
     */
    const chroniclerTheme = EditorView.theme(
        {
            "&": {
                // No fixed height, let it grow with content
                width: "100%",
                backgroundColor: "transparent",
                color: "var(--color-text-primary)",
            },
            // Monospace, because this pane is the source rather than the page:
            // it is where alignment, indentation and fence characters matter,
            // and setting it in the body face invited it to be read as prose.
            ".cm-content": {
                fontFamily: "var(--font-mono)",
                fontSize: "0.82rem",
                lineHeight: "1.85",
                paddingBottom: "50vh",
            },
            ".cm-gutters": {
                backgroundColor: "transparent",
                border: "none",
                color: "color-mix(in srgb, var(--color-text-secondary) 45%, var(--color-background-primary))",
            },
            ".cm-lineNumbers .cm-gutterElement": {
                minWidth: "3.1rem",
                paddingRight: "0.9rem",
                textAlign: "right",
                userSelect: "none",
            },
            // Tinted across the gutter as well as the text, so the line you're
            // on reads as one band rather than as a highlight that stops short
            // of its own number.
            ".cm-activeLine": {
                backgroundColor: "var(--tint-accent-line)",
            },
            ".cm-activeLineGutter": {
                backgroundColor: "var(--tint-accent-line)",
            },
            // Agreeing with the preview: a link that will render blue is blue
            // here, and one that will render as a broken link says so now
            // rather than after you close the editor.
            ".cm-wikilink": {
                color: "var(--color-text-link)",
            },
            ".cm-wikilink-broken": {
                color: "var(--color-text-link-broken)",
                textDecoration: "underline dotted",
            },
            ".cm-cursor": {
                borderLeftColor: "var(--color-text-primary)",
            },
            // Selection
            ".cm-selectionBackground, ::selection": {
                backgroundColor: "var(--color-accent-primary) !important",
                opacity: "0.3",
            },
            "&.cm-focused .cm-selectionBackground": {
                backgroundColor: "var(--color-accent-primary) !important",
                opacity: "0.3",
            },
            // Autocomplete Dropdown
            ".cm-tooltip.cm-tooltip-autocomplete": {
                backgroundColor: "var(--color-background-primary)",
                border: "1px solid var(--color-border-primary)",
                borderRadius: "6px",
                boxShadow: "0 4px 12px var(--color-overlay-subtle)",
            },
            ".cm-tooltip.cm-tooltip-autocomplete > ul": {
                fontFamily: "var(--font-family-body)",
                maxHeight: "10em",
            },
            ".cm-tooltip-autocomplete li": {
                padding: "0.4rem 0.8rem",
                color: "var(--color-text-secondary)",
            },
            ".cm-tooltip-autocomplete li[aria-selected]": {
                backgroundColor: "var(--color-background-tertiary)",
                color: "var(--color-text-primary)",
            },
            ".cm-completionIcon-link:after": { content: "'🔗'" },
            ".cm-completionIcon-image:after": { content: "'🖼️'" },
            ".cm-completionIcon-keyword:after": { content: "'#'" },
        },
        { dark: false },
    );

    /**
     * 2. SYNTAX HIGHLIGHTING STYLE
     * Maps Lezer tags (t.*) to your new CSS Variables.
     * This ensures the highlighting responds instantly to theme changes.
     */
    const chroniclerHighlightStyle = HighlightStyle.define([
        // --- MARKDOWN STRUCTURE ---
        {
            tag: t.heading,
            color: "var(--color-text-heading)",
            fontWeight: "bold",
        },
        {
            tag: t.strong,
            color: "var(--color-text-primary)",
            fontWeight: "bold",
        },
        {
            tag: t.emphasis,
            color: "var(--color-text-primary)",
            fontStyle: "italic",
        },
        {
            tag: [t.quote, t.comment],
            color: "var(--color-text-secondary)",
            fontStyle: "italic",
        },
        {
            tag: t.list,
            color: "var(--color-text-primary)",
        },

        // --- LINKS ---
        {
            tag: t.link,
            color: "var(--color-text-link)",
            textDecoration: "underline",
        },
        {
            tag: t.url,
            color: "var(--color-text-link)",
            textDecoration: "none",
        },

        // --- FRONTMATTER & METADATA ---
        {
            tag: t.meta, // '---' separators
            color: "var(--color-text-secondary)",
        },

        // --- CODE & SYNTAX HIGHLIGHTING ---

        // 1. Inline Code (The `backtick` style)
        {
            tag: t.monospace,
            color: "var(--color-text-primary)",
            backgroundColor: "var(--code-background-inline)",
            borderRadius: "3px",
            padding: "0 2px",
        },

        // 2. HTML/XML Tags (<div, <span)
        {
            tag: [t.tagName, t.standard(t.tagName)],
            color: "var(--code-tag)",
            fontWeight: "bold",
        },

        // 3. HTML attributes (class=, href=)
        {
            tag: t.attributeName,
            color: "var(--code-attribute)",
        },

        // 4. Frontmatter keys. These are the fields that become the infobox,
        //    so they take the accent the infobox's own labels are drawn in
        //    rather than reading as generic markup.
        {
            tag: t.propertyName,
            color: "var(--color-accent-primary)",
        },

        // 5. Strings & content inside quotes
        {
            tag: t.string,
            color: "var(--code-string)",
        },

        // 6. Brackets and separators (keep subtle)
        {
            tag: [t.bracket, t.punctuation],
            color: "var(--color-text-secondary)",
        },
    ]);

    /**
     * Whether a wikilink target resolves, for the editor's link colouring.
     * Reads the world stores imperatively because it is called from inside a
     * CodeMirror extension rather than from reactive markup.
     */
    function wikilinkResolves(target: string, isImage: boolean): boolean {
        if (!target) return false;
        const known = isImage ? get(allImageFiles) : get(allFileTitles);
        return known.some(
            (label) => label.toLowerCase() === target.toLowerCase(),
        );
    }

    // The svelte-codemirror-editor wrapper handles basic setup like history and default keymaps.
    // We only need to provide the extensions that are truly custom to our application.
    const extensions = [
        // Wrap markdown in yamlFrontmatter to parse the top block as YAML
        yamlFrontmatter({
            content: markdown({
                base: markdownLanguage, // Uses GFM (Tables, Task lists, etc.) instead of strict CommonMark
            }),
        }),

        keybindingCompartment.of(buildKeymap(get(effectiveBindings))),
        EditorView.lineWrapping,

        // Draws the leading YAML as an infobox card. Built once with the
        // language active at mount, like the rest of this extension list.
        frontmatterBlock({
            label: get(tr)("editor.infoboxFields"),
            actionLabel: get(tr)("editor.editAsForm"),
            onEditAsForm: handleInfoboxClick,
        }),

        // Paste an image from the clipboard. Reads the OS clipboard via the
        // backend (WebKitGTK leaves the paste event's clipboardData empty for
        // images), and never blocks the default text paste.
        EditorView.domEventHandlers({
            paste: (_event, view) => {
                void pasteImageFromClipboard(view, pageName, pagePath);
                return false;
            },
        }),

        // Colours [[wikilinks]], and flags the ones that don't resolve.
        wikilinkHighlight(wikilinkResolves),

        // Keeps the pane header's "Ln 14" honest.
        EditorView.updateListener.of((update) => {
            if (!update.selectionSet && !update.docChanged) return;
            const head = update.state.selection.main.head;
            cursorLine = update.state.doc.lineAt(head).number;
        }),

        // The structural base theme
        chroniclerTheme,

        // The semantic highlighting theme
        syntaxHighlighting(chroniclerHighlightStyle),

        autocompletion({ override: [customCompletions] }),
    ];
</script>

<div class="editor-container">
    <!-- Split view puts two same-coloured, same-width panes side by side and
         the eye has nothing to grab. The strip says which is which. -->
    {#if showPaneHeader}
        <div class="pane-header">
            <span class="eyebrow">{$tr("editor.markdownPane")}</span>
            <span class="pane-meta">{paneMeta}</span>
        </div>
    {/if}
    <div class="editor-wrapper">
        <Codemirror
            on:ready={(e) => (editor = e.detail)}
            bind:value={content}
            {extensions}
            placeholder={$tr("editor.placeholder")}
            nodebounce={true}
        />
    </div>
    <!-- Below the text rather than above it: these actions put things into the
         document, and they now sit against the edge of the thing they write to
         instead of a region away at the top of the window. -->
    <EditorToolbar
        editorView={editor}
        onInfoboxClick={handleInfoboxClick}
        {pagePath}
    />
</div>

<style>
    .editor-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: hidden;
        background: var(--color-overlay-subtle);
    }
    .pane-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        height: 30px;
        flex-shrink: 0;
        box-sizing: border-box;
        padding: 0 14px;
        border-bottom: 1px solid var(--hairline-soft);
    }
    .pane-meta {
        font-family: var(--font-mono);
        font-size: 0.64rem;
        color: var(--color-text-secondary);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    .editor-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
        box-sizing: border-box;
        flex-grow: 1;
        overflow-y: auto;
        padding: 0.5rem 1rem 2rem 0;
    }
</style>
