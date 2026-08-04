<script lang="ts">
    import type { EditorView } from "@codemirror/view";
    import Icon from "$lib/components/ui/Icon.svelte";
    import {
        toggleBold,
        toggleItalic,
        toggleStrikethrough,
        addHeading,
        insertWikilink,
        insertGallery,
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

    // Actions in groups, so the strip reads as "inline emphasis | structure |
    // insert" rather than one undifferentiated row of glyphs. The insert group
    // is what the strip is mostly for: those actions put things into the text
    // directly under them.
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
                title: $t("editor.insertLink"),
                action: insertWikilink,
                iconType: "connect",
            },
            {
                title: $t("editor.insertImage"),
                action: (v: EditorView) => {
                    void pickAndInsertImages(v, pagePath);
                },
                iconType: "image",
            },
            {
                title: $t("editor.insertGallery"),
                action: insertGallery,
                iconType: "gallery",
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

    <div class="separator"></div>

    <!-- The infobox belongs with insert actions: it adds structured fields to
         the page rather than formatting what's already there. -->
    <button title={$t("editor.editInfobox")} onclick={onInfoboxClick}>
        <Icon type="textCard" />
    </button>
</div>

<style>
    .editor-toolbar {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        height: 34px;
        box-sizing: border-box;
        padding: 0 12px;
        border-top: 1px solid var(--hairline-soft);
        background-color: var(--color-overlay-subtle);
        flex-shrink: 0;
    }
    button {
        background: none;
        border: 1px solid transparent;
        color: var(--color-text-secondary);
        font-size: 1rem;
        width: 26px;
        height: 26px;
        flex-shrink: 0;
        border-radius: 4px;
        cursor: pointer;
        opacity: 0.75;
        transition:
            background-color 0.2s,
            opacity 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 5px;
    }

    button:hover {
        opacity: 1;
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
    }

    .separator {
        width: 1px;
        height: 16px;
        flex-shrink: 0;
        background-color: var(--hairline-soft);
        margin: 0 0.35rem;
    }
</style>
