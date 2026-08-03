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

    // Actions in groups, so the toolbar reads as "inline emphasis | structure |
    // insert" rather than one undifferentiated row of nine glyphs.
    const toolbarGroups = $derived<ToolbarAction[][]>([
        [
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
        ],
        [
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
        ],
        [
            {
                title: $t("editor.insertImage"),
                action: (v: EditorView) => {
                    void pickAndInsertImages(v, pagePath);
                },
                iconType: "image",
            },
        ],
    ]);

    function handleAction(action: (view: EditorView) => void) {
        if (editorView) {
            action(editorView);
            editorView.focus();
        }
    }
</script>

<div class="editor-toolbar">
    {#each toolbarGroups as group, i}
        {#if i > 0}
            <div class="separator"></div>
        {/if}
        {#each group as { title, action, iconType }}
            <button {title} onclick={() => handleAction(action)}>
                <Icon type={iconType} />
            </button>
        {/each}
    {/each}

    <!-- The infobox belongs with insert actions: it adds structured fields to
         the page rather than formatting what's already there. -->
    <button title={$t("editor.editInfobox")} onclick={onInfoboxClick}>
        <Icon type="edit" />
    </button>
</div>

<style>
    .editor-toolbar {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        height: 40px;
        box-sizing: border-box;
        padding: 0 16px;
        border-bottom: 1px solid var(--color-border-primary);
        background-color: var(--color-overlay-subtle);
        flex-shrink: 0;
    }
    button {
        background: none;
        border: 1px solid transparent;
        color: var(--color-text-secondary);
        font-size: 1rem;
        width: 30px;
        height: 30px;
        flex-shrink: 0;
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
        height: 18px;
        flex-shrink: 0;
        background-color: var(--color-border-primary);
        margin: 0 0.4rem;
    }
</style>
