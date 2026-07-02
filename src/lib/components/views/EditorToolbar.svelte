<script lang="ts">
    import type { EditorView } from "@codemirror/view";
    import Icon from "$lib/components/ui/Icon.svelte";
    import {
        toggleBold,
        toggleItalic,
        toggleStrikethrough,
        addHeading,
    } from "$lib/editor";
    import type { IconType } from "$lib/icons";
    import { pickAndInsertImages } from "$lib/imageInsert";
    import { t } from "$lib/i18n";

    let {
        editorView,
        onInfoboxClick,
        pagePath = "",
    } = $props<{
        editorView: EditorView | undefined;
        onInfoboxClick?: () => void;
        pagePath?: string;
    }>();

    // Define an interface for the actions
    interface ToolbarAction {
        title: string;
        action: (v: EditorView) => void;
        iconType: IconType;
    }

    // Define all toolbar actions in an array
    const toolbarActions = $derived<ToolbarAction[]>([
        {
            title: $t("editor.bold"),
            action: toggleBold,
            iconType: "bold",
        },
        {
            title: $t("editor.italic"),
            action: toggleItalic,
            iconType: "italic",
        },
        {
            title: $t("editor.strikethrough"),
            action: toggleStrikethrough,
            iconType: "strikethrough",
        },
        {
            title: $t("editor.heading1"),
            action: (v: EditorView) => addHeading(v, 1),
            iconType: "heading1",
        },
        {
            title: $t("editor.heading2"),
            action: (v: EditorView) => addHeading(v, 2),
            iconType: "heading2",
        },
        {
            title: $t("editor.heading3"),
            action: (v: EditorView) => addHeading(v, 3),
            iconType: "heading3",
        },
        {
            title: $t("editor.insertImage"),
            action: (v: EditorView) => {
                void pickAndInsertImages(v, pagePath);
            },
            iconType: "image",
        },
    ]);

    function handleAction(action: (view: EditorView) => void) {
        if (editorView) {
            action(editorView);
            editorView.focus();
        }
    }
</script>

<div class="editor-toolbar">
    {#each toolbarActions as { title, action, iconType }}
        <button {title} onclick={() => handleAction(action)}>
            <Icon type={iconType} />
        </button>
    {/each}

    <!-- Separator -->
    <div class="separator"></div>

    <!-- Infobox Button -->
    <button title={$t("editor.editInfobox")} onclick={onInfoboxClick}>
        <Icon type="edit" />
    </button>
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
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.3rem;
    }

    button:hover {
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
    }

    .separator {
        width: 1px;
        height: 20px;
        background-color: var(--color-border-primary);
        margin: 0 0.5rem;
    }
</style>
