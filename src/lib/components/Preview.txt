<script lang="ts">
    import type { RenderedPage } from "$lib/bindings";
    import Infobox from "./Infobox.svelte";

    // The type for the infobox data is complex, so we can use `any` here.
    // It's the `processed_frontmatter` object from the Rust backend.
    type InfoboxData = any;

    let {
        renderedData,
        infoboxData = null,
        imageUrl = null,
        mode = "unified",
    } = $props<{
        renderedData: RenderedPage | null;
        infoboxData?: InfoboxData | null;
        imageUrl?: string | null;
        mode?: "split" | "unified";
    }>();
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<div class="preview-content" role="document" tabindex="0">
    {#if infoboxData}
        <!-- A class is added based on the mode to control the layout -->
        <div class="infobox-wrapper mode-{mode}">
            <Infobox data={infoboxData} {imageUrl} />
        </div>
    {/if}

    {#if renderedData}
        {@html renderedData.rendered_html}
    {/if}
</div>

<style>
    .preview-content {
        line-height: 1.7;
    }

    /* Layout for the unified, single-pane view */
    .infobox-wrapper.mode-unified {
        float: right;
        width: 100%;
        max-width: 320px;
        margin-left: 2rem;
        margin-bottom: 1rem;
    }

    /* Layout for the split-pane view */
    .infobox-wrapper.mode-split {
        margin-bottom: 2rem;
    }

    /* On smaller screens, always stack the infobox on top */
    @media (max-width: 800px) {
        .infobox-wrapper.mode-unified {
            float: none;
            width: 100%;
            max-width: none;
            margin-left: 0;
        }
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
    /* For inline code: `like this` */
    .preview-content :global(:not(pre) > code) {
        background-color: rgba(0, 0, 0, 0.05);
        padding: 0.2em 0.4em;
        border-radius: 3px;
    }
    /* For the fenced code block container (```) */
    .preview-content :global(pre) {
        background-color: rgba(0, 0, 0, 0.05);
        padding: 1em;
        border-radius: 4px;
        overflow-x: auto;
    }
    /* For the code *inside* the fenced block (removes the extra background) */
    .preview-content :global(pre > code) {
        background-color: transparent;
        padding: 0;
    }
    .preview-content :global(table) {
        width: 100%;
        border-collapse: collapse;
        margin-block: 1.5em;
        font-size: 0.95rem;
        line-height: 1.5;
    }
    .preview-content :global(th),
    .preview-content :global(td) {
        border: 1px solid var(--border-color);
        padding: 0.6em 0.8em;
        text-align: left;
    }
    .preview-content :global(th) {
        background-color: rgba(0, 0, 0, 0.03);
        font-weight: bold;
    }
</style>
