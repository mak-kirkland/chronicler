<script lang="ts">
    import { onMount } from "svelte";
    import Codemirror from "svelte-codemirror-editor";
    import { markdown } from "@codemirror/lang-markdown";
    import { EditorView, keymap } from "@codemirror/view";
    import {
        autocompletion,
        type CompletionContext,
        type CompletionResult,
    } from "@codemirror/autocomplete";
    import { get } from "svelte/store";
    import { allFileTitles, tags } from "$lib/worldStore";
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
            const allFiles = get(allFileTitles);
            return {
                from: linkMatch.from + 2, // Start replacing after the [[
                options: allFiles.map((title) => ({
                    label: title,
                    type: "link",
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
                })),
                filter: true,
            };
        }

        // Check for frontmatter tag completion trigger
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
                const allTags = get(tags);
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
    ];

    const customTheme = EditorView.theme({
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
        // Style the autocomplete dropdown to match the app
        ".cm-tooltip.cm-tooltip-autocomplete > ul": {
            backgroundColor: "var(--color-background-primary)",
            border: "1px solid var(--color-border-primary)",
            fontFamily: "var(--font-family-body)",
        },
        ".cm-tooltip-autocomplete li[aria-selected]": {
            backgroundColor: "var(--color-background-tertiary)",
            color: "var(--color-text-primary)",
        },
        ".cm-completionIcon-link": {
            "&:after": { content: "'🔗'" },
        },
        ".cm-completionIcon-keyword": {
            "&:after": { content: "'#'" },
        },
    });

    // The svelte-codemirror-editor wrapper handles basic setup like history and default keymaps.
    // We only need to provide the extensions that are truly custom to our application.
    const extensions = [
        markdown(),
        keymap.of(customKeymap),
        EditorView.lineWrapping,
        customTheme,
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
