<script lang="ts">
    import type { CanvasData, CanvasTextNode } from "$lib/canvasModels";
    import * as M from "$lib/canvasMutations";
    import { renderMarkdown } from "$lib/commands";
    import Editor from "$lib/components/views/Editor.svelte";
    import { log } from "$lib/logger";

    let { node, editing, path, onMutate, onDoneEditing } = $props<{
        node: CanvasTextNode;
        editing: boolean;
        path: string;
        onMutate: (fn: (d: CanvasData) => CanvasData) => void;
        onDoneEditing: () => void;
    }>();

    let draft = $state(node.text);
    let html = $state("");
    let snapshotTaken = false;

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

    // On entering edit mode, take a single undo snapshot of pre-edit state.
    $effect(() => {
        if (editing && !snapshotTaken) {
            draft = node.text;
            snapshotTaken = true;
        }
    });

    function commit() {
        if (draft !== node.text) {
            // The snapshot for undo is the pre-edit canvas state; record it now.
            onMutate((d: CanvasData) => {
                // push handled in CanvasView.mutate; here we just set the text
                return M.patchNode(d, node.id, { text: draft });
            });
        }
        snapshotTaken = false;
        onDoneEditing();
    }
</script>

{#if editing}
    <div
        class="edit-wrap"
        onpointerdown={(e) => e.stopPropagation()}
        role="textbox"
        tabindex="-1"
    >
        <Editor bind:content={draft} pagePath={path} isActive={true} shouldFocus={true} />
        <button class="done" onclick={commit}>Done</button>
    </div>
{:else}
    <div class="rendered">
        {#if html}
            {@html html}
        {:else}
            <span class="placeholder">Double-click to edit…</span>
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
    .placeholder {
        color: var(--color-text-secondary);
        font-style: italic;
    }
    .done {
        position: absolute;
        right: 6px;
        bottom: 6px;
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
        cursor: pointer;
    }
</style>
