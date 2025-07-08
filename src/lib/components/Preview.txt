<script lang="ts">
    import type { RenderedPage } from "$lib/bindings";

    let { renderedData } = $props<{ renderedData: RenderedPage | null }>();
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<div class="preview-content" role="document" tabindex="0">
    {#if renderedData}
        {@html renderedData.rendered_html}
    {/if}
</div>

<style>
    .preview-content {
        line-height: 1.7;
    }
    .preview-content :global(h1),
    .preview-content :global(h2),
    .preview-content :global(h3) {
        font-family: "Uncial Antiqua", cursive;
        color: var(--ink-light);
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 0.3em;
        margin-top: 1.5em;
        margin-bottom: 0.3em;
    }
    .preview-content :global(h1 + p),
    .preview-content :global(h2 + p),
    .preview-content :global(h3 + p) {
        margin-top: 0;
    }
    .preview-content :global(a.internal-link) {
        color: #2563eb;
        text-decoration: none;
        border-bottom: 1px dotted #2563eb;
        cursor: pointer;
    }
    .preview-content :global(span.internal-link.broken) {
        color: #b04a4a;
        text-decoration: none;
        border-bottom: 1px dotted #b04a4a;
        cursor: help;
    }
    .preview-content :global(blockquote) {
        border-left: 3px solid var(--border-color);
        padding-left: 1em;
        margin-left: 0;
        font-style: italic;
        color: var(--ink-light);
    }
    .preview-content :global(code) {
        background-color: rgba(0, 0, 0, 0.05);
        padding: 0.2em 0.4em;
        border-radius: 3px;
    }
    .preview-content :global(pre) {
        background-color: rgba(0, 0, 0, 0.05);
        padding: 1em;
        border-radius: 4px;
        overflow-x: auto;
    }
</style>
