<script lang="ts">
    import type { CanvasData, CanvasTextNode } from "$lib/canvasModels";
    import * as M from "$lib/canvasMutations";
    import { renderMarkdown } from "$lib/commands";
    import { autofocus, whenImagesSettled } from "$lib/domActions";
    import { tick } from "svelte";
    import { log } from "$lib/logger";
    import { t } from "$lib/i18n";

    let { node, editing, onMutate, onDoneEditing, onRendered } = $props<{
        node: CanvasTextNode;
        editing: boolean;
        onMutate: (fn: (d: CanvasData) => CanvasData) => void;
        onDoneEditing: () => void;
        /** Fired after each render has settled, images included, so the node
         *  can measure it. `afterEdit`: this is the text an edit committed. */
        onRendered?: (afterEdit: boolean) => void;
    }>();

    // Snapshot only; the effect below re-seeds it on entering edit mode.
    // svelte-ignore state_referenced_locally
    let draft = $state(node.text);
    let html = $state("");
    let renderedEl = $state<HTMLDivElement | null>(null);
    // Text the last edit committed, until it has rendered. The store applies
    // the commit asynchronously, so the first render after leaving edit mode
    // can still be of the old text — this tells the two apart.
    let committedText: string | null = null;

    // The text alone, so the effect below doesn't re-run when only the node's
    // position or size changes (every frame of a drag or resize).
    const storedText = $derived(node.text);

    // Render preview whenever the stored text changes (and not editing).
    $effect(() => {
        if (editing) return;
        const text = storedText;
        // A slower render of an older text must not overwrite a newer one.
        let cancelled = false;
        const settle = async () => {
            const afterEdit = text === committedText;
            if (afterEdit) committedText = null;
            await tick();
            if (renderedEl) await whenImagesSettled(renderedEl);
            if (!cancelled) onRendered?.(afterEdit);
        };
        if (!text.trim()) {
            html = "";
            settle();
        } else {
            renderMarkdown(text)
                .then((r) => {
                    if (cancelled) return;
                    html = r.html_before_toc + r.html_after_toc;
                    return settle();
                })
                .catch((e) =>
                    log.error("canvas text render failed", e, "CanvasTextCard"),
                );
        }
        return () => (cancelled = true);
    });

    // Re-seed the draft from the stored text on entering edit mode.
    let wasEditing = false;
    $effect(() => {
        if (editing && !wasEditing) draft = node.text;
        wasEditing = editing;
    });

    function commit() {
        // Captured now: the update may run later, after `draft` is re-seeded.
        const text = draft;
        if (text !== node.text) {
            committedText = text;
            onMutate((d: CanvasData) => M.patchNode(d, node.id, { text }));
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
            class="card-scroll"
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
    <!-- `chronicler-note` marks rendered note content so user CSS snippets
         reach canvas cards too. It is style-free by design: the article
         typography in preview.css lives on `chronicler-content`, which would
         oversize headings in a small card. -->
    <div class="rendered chronicler-note card-scroll" bind:this={renderedEl}>
        {#if html}
            {@html html}
        {:else}
            <span class="placeholder">{$t("canvas.textEmptyHint")}</span>
        {/if}
    </div>
{/if}

<style>
    /* `hidden`, not `auto`, here and on the textarea: a native scroller blurs
       the card when zoomed (see CanvasNode's onWheel, which scrolls them
       instead). A textarea still scrolls itself to its caret. */
    .edit-wrap,
    .rendered {
        width: 100%;
        height: 100%;
        overflow: hidden;
        padding: 8px 10px;
        box-sizing: border-box;
        font-size: 13px;
        line-height: 1.45;
        color: var(--color-text-primary);
    }
    .edit-wrap {
        padding: 0;
    }
    textarea {
        width: 100%;
        height: 100%;
        padding: 8px 10px;
        box-sizing: border-box;
        resize: none;
        overflow: hidden;
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
