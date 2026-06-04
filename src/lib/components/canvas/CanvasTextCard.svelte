<script lang="ts">
    import type { CanvasData, CanvasTextNode } from "$lib/canvasModels";
    import * as M from "$lib/canvasMutations";
    import { renderMarkdown } from "$lib/commands";
    import { autofocus } from "$lib/domActions";
    import { log } from "$lib/logger";
    import { t } from "$lib/i18n";

    let { node, editing, onMutate, onDoneEditing } = $props<{
        node: CanvasTextNode;
        editing: boolean;
        onMutate: (fn: (d: CanvasData) => CanvasData) => void;
        onDoneEditing: () => void;
    }>();

    let draft = $state(node.text);
    let html = $state("");

    // Render preview whenever the stored text changes (and not editing).
    $effect(() => {
        if (editing) return;
        const text = node.text;
        if (!text.trim()) {
            html = "";
            return;
        }
        renderMarkdown(text)
            .then((r) => (html = r.html_before_toc + r.html_after_toc))
            .catch((e) => log.error("canvas text render failed", e, "CanvasTextCard"));
    });

    // Re-seed the draft from the stored text on entering edit mode.
    let wasEditing = false;
    $effect(() => {
        if (editing && !wasEditing) draft = node.text;
        wasEditing = editing;
    });

    function commit() {
        if (draft !== node.text) {
            onMutate((d: CanvasData) => M.patchNode(d, node.id, { text: draft }));
        }
        onDoneEditing();
    }
</script>

{#if editing}
    <!-- Plain textarea styled to match the preview exactly, so entering and
         leaving edit mode doesn't visually jump. Blur and Escape both commit. -->
    <div
        class="edit-wrap"
        onpointerdown={(e) => e.stopPropagation()}
        role="textbox"
        tabindex="-1"
    >
        <textarea
            bind:value={draft}
            use:autofocus
            placeholder={$t("canvas.textPlaceholder")}
            onblur={commit}
            onfocus={(e) => {
                // Caret at the end, not the start.
                const t = e.currentTarget;
                t.selectionStart = t.selectionEnd = t.value.length;
            }}
            onkeydown={(e) => {
                if (e.key === "Escape") {
                    e.stopPropagation();
                    commit();
                }
            }}
        ></textarea>
    </div>
{:else}
    <div class="rendered">
        {#if html}
            {@html html}
        {:else}
            <span class="placeholder">{$t("canvas.textEmptyHint")}</span>
        {/if}
    </div>
{/if}

<style>
    .edit-wrap,
    .rendered {
        width: 100%;
        height: 100%;
        overflow: auto;
        padding: 8px 10px;
        box-sizing: border-box;
        font-size: 13px;
        line-height: 1.45;
        color: var(--color-text-primary);
    }
    .edit-wrap {
        overflow: hidden;
        padding: 0;
    }
    textarea {
        width: 100%;
        height: 100%;
        padding: 8px 10px;
        box-sizing: border-box;
        resize: none;
        border: none;
        outline: none;
        background: transparent;
        color: inherit;
        font: inherit;
    }
    .placeholder {
        color: var(--color-text-secondary);
        font-style: italic;
    }
</style>
