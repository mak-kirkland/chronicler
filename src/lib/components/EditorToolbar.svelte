<script lang="ts">
    import type { EditorView } from "@codemirror/view";
    import {
        toggleBold,
        toggleItalic,
        toggleStrikethrough,
        addHeading,
    } from "$lib/editor";

    let { editorView } = $props<{ editorView: EditorView | undefined }>();

    // Define all toolbar actions in an array
    const toolbarActions = [
        {
            title: "Bold (Ctrl+B)",
            action: toggleBold,
            display: "<b>B</b>",
        },
        {
            title: "Italic (Ctrl+I)",
            action: toggleItalic,
            display: "<i>I</i>",
        },
        {
            title: "Strikethrough",
            action: toggleStrikethrough,
            display: "<s>S</s>",
        },
        {
            title: "Heading 1",
            action: (v: EditorView) => addHeading(v, 1),
            display: "H1",
        },
        {
            title: "Heading 2",
            action: (v: EditorView) => addHeading(v, 2),
            display: "H2",
        },
        {
            title: "Heading 3",
            action: (v: EditorView) => addHeading(v, 3),
            display: "H3",
        },
    ];

    function handleAction(action: (view: EditorView) => void) {
        if (editorView) {
            action(editorView);
            editorView.focus();
        }
    }
</script>

<div class="editor-toolbar">
    {#each toolbarActions as { title, action, display }}
        <button {title} onclick={() => handleAction(action)}>
            {@html display}
        </button>
    {/each}
</div>

<style>
    .editor-toolbar {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.5rem 2rem;
        border-bottom: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        flex-shrink: 0;
    }
    button {
        background: none;
        border: 1px solid transparent;
        color: var(--color-text-secondary);
        font-size: 1rem;
        width: 32px;
        height: 32px;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    button:hover {
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
    }

    button :global(b) {
        font-weight: 800;
    }
</style>
