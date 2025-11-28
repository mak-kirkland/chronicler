<script lang="ts">
    import { onMount } from "svelte";
    import { defaultKeymap } from "@codemirror/commands";
    import Codemirror from "svelte-codemirror-editor";
    import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
    import { yamlFrontmatter } from "@codemirror/lang-yaml";
    import { EditorView, keymap } from "@codemirror/view";
    import { Prec } from "@codemirror/state";
    import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
    import { tags as t } from "@lezer/highlight";
    import {
        acceptCompletion,
        autocompletion,
        type CompletionContext,
        type CompletionResult,
        type Completion,
        closeCompletion,
    } from "@codemirror/autocomplete";
    import { get } from "svelte/store";
    import {
        allFileTitles,
        allImageFiles,
        tags as worldTags,
    } from "$lib/worldStore";
    import { toggleBold, toggleItalic } from "$lib/editor";
    import EditorToolbar from "./EditorToolbar.svelte";

    let { content = $bindable() } = $props<{ content?: string }>();
    let editor: EditorView | undefined = $state();

    onMount(() => {
        editor?.focus();
    });

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

            // We construct the matches array manually to handle filtering
            // 1. Filter existing matches first
            const matches: Completion[] = optionsSource
                .filter((label) => label.toLowerCase().includes(query))
                .map((label) => ({
                    label: label,
                    type: isImageLink ? "image" : "link",
                    // We use a custom apply function to gain full control over the completion.
                    // This allows us to insert the text and manually place the cursor.
                    apply: (view, completion, from, to) => {
                        // Dispatch a transaction to the editor.
                        view.dispatch({
                            // Insert the selected title plus the closing brackets.
                            changes: {
                                from,
                                to,
                                insert: `${completion.label}`,
                            },
                            // Set the cursor position to be right after the inserted text.
                            selection: {
                                anchor: from + completion.label.length + 2,
                            },
                        });
                    },
                }));

            // 2. Only add "Create" if NO other matches were found
            if (matches.length === 0 && rawQuery.trim().length > 0) {
                matches.push({
                    label: rawQuery,
                    displayLabel: `Create "${rawQuery}"`,
                    type: "keyword",
                    // The apply function here is identical, ensuring it inserts the text
                    apply: (view, completion, from, to) => {
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
                    },
                });
            }

            return {
                from: linkMatch.from + 2,
                options: matches,
                filter: false,
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

    // Define custom keybindings
    const customKeymap = [
        {
            key: "Mod-b",
            run: (view: EditorView) => {
                toggleBold(view);
                return true;
            },
        },
        {
            key: "Mod-i",
            run: (view: EditorView) => {
                toggleItalic(view);
                return true;
            },
        },
        {
            key: "Shift-Enter",
            run: forceWikilinkCompletion,
        },
        {
            key: "Tab",
            run: acceptCompletion,
        },
    ];

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
            ".cm-content": {
                fontFamily: "var(--font-family-body)",
                fontSize: "1.1rem",
                lineHeight: "1.8",
                paddingBottom: "50vh",
            },
            ".cm-gutters": {
                backgroundColor: "transparent",
                border: "none",
            },
            ".cm-activeLine": {
                backgroundColor: "var(--color-overlay-medium)",
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
            color: "var(--color-accent-primary)",
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

        // 3. HTML and YAML Attributes (class=, href=) & Object Properties
        {
            tag: [t.attributeName, t.propertyName],
            color: "var(--code-attribute)",
        },

        // 4. Strings & content inside quotes
        {
            tag: t.string,
            color: "var(--code-string)",
        },

        // 5. Brackets and separators (keep subtle)
        {
            tag: [t.bracket, t.punctuation],
            color: "var(--color-text-secondary)",
        },
    ]);

    // The svelte-codemirror-editor wrapper handles basic setup like history and default keymaps.
    // We only need to provide the extensions that are truly custom to our application.
    const extensions = [
        // Wrap markdown in yamlFrontmatter to parse the top block as YAML
        yamlFrontmatter({
            content: markdown({
                base: markdownLanguage, // Uses GFM (Tables, Task lists, etc.) instead of strict CommonMark
            }),
        }),

        Prec.highest(keymap.of([...customKeymap, ...defaultKeymap])),
        EditorView.lineWrapping,

        // The structural base theme
        chroniclerTheme,

        // The semantic highlighting theme
        syntaxHighlighting(chroniclerHighlightStyle),

        autocompletion({ override: [customCompletions] }),
    ];
</script>

<div class="editor-container">
    <EditorToolbar editorView={editor} />
    <div class="editor-wrapper">
        <Codemirror
            on:ready={(e) => (editor = e.detail)}
            bind:value={content}
            {extensions}
            placeholder="Let your story unfold..."
            nodebounce={true}
        />
    </div>
</div>

<style>
    .editor-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: hidden;
    }
    .editor-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
        box-sizing: border-box;
        flex-grow: 1;
        overflow-y: auto;
        padding: 0 2rem 2rem 2rem;
    }
</style>
