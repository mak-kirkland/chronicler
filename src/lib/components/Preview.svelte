<script lang="ts">
    import type { RenderedPage } from "$lib/bindings";
    import Infobox from "./Infobox.svelte";
    import TableOfContents from "./TableOfContents.svelte";
    import { isTocVisible } from "$lib/settingsStore";

    // The type for the infobox data is complex, so we can use `any` here.
    // It's the `processed_frontmatter` object from the Rust backend.
    type InfoboxData = any;

    let {
        renderedData,
        infoboxData = null,
        mode = "unified",
    } = $props<{
        renderedData: RenderedPage | null;
        infoboxData?: InfoboxData | null;
        mode?: "split" | "unified";
    }>();
</script>

<!--
  The main container has a mode class and will control the layout.
  The main content is wrapped in its own div to create a distinct flex item.
  -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<div class="preview-container mode-{mode}" role="document" tabindex="0">
    {#if infoboxData}
        <!-- Use <aside> for better semantics. It's floated, so order in HTML matters. -->
        <aside class="infobox-wrapper">
            <Infobox data={infoboxData} />
        </aside>
    {/if}

    {#if renderedData}
        <div class="main-content-wrapper">
            <div class="main-content">
                {@html renderedData.html_before_toc}

                {#if renderedData.toc.length > 0 && $isTocVisible}
                    <aside class="toc-wrapper">
                        <TableOfContents toc={renderedData.toc} />
                    </aside>
                {/if}

                {@html renderedData.html_after_toc}
            </div>
        </div>
    {/if}
</div>

<style>
    .preview-container {
        line-height: 1.7;
    }

    /* --- Float-based Layout for Unified Mode --- */
    .preview-container.mode-unified .infobox-wrapper {
        float: right;
        width: clamp(20rem, 20vw, 28rem);
        /* Add margin to create space between the infobox and the wrapping text */
        margin-left: 2rem;
        margin-bottom: 1rem;
    }

    /* The TOC behaves as a block element */
    .preview-container.mode-unified .toc-wrapper {
        width: clamp(20rem, 22vw, 28rem);
        margin-bottom: 1rem;
    }

    /* --- Layout for Split Mode (Infobox on top) --- */
    .preview-container.mode-split .infobox-wrapper,
    .preview-container.mode-split .toc-wrapper {
        width: 100%;
        margin-bottom: 2rem;
    }

    /* --- Responsive Overrides --- */
    /* On smaller screens, disable float and stack the infobox on top for both modes. */
    @media (max-width: 800px) {
        .preview-container.mode-unified .infobox-wrapper,
        .preview-container.mode-unified .toc-wrapper {
            float: none;
            width: 100%;
            margin-left: 0;
            margin-right: 0;
            margin-bottom: 1rem;
        }
    }

    .main-content-wrapper {
    }

    /* --- Global Styles for Rendered Content --- */
    /* These selectors are specific to target only the main content area. */

    .main-content :global(h1),
    .main-content :global(h2),
    .main-content :global(h3) {
        border-bottom: 1px solid var(--color-border-primary);
        padding-bottom: 0.3em;
        margin-top: 1.5em;
        margin-bottom: 0.3em;
        /*
         * Using 'overflow: hidden' creates a new block formatting context,
         * which makes the header's block (including its border) correctly
         * wrap around the floated infobox.
         */
        overflow: hidden;
        clear: left;
    }

    .main-content :global(h1 + p),
    .main-content :global(h2 + p),
    .main-content :global(h3 + p) {
        margin-top: 0;
    }
    .main-content :global(blockquote) {
        border-left: 3px solid var(--color-border-primary);
        padding-left: 1em;
        margin-left: 0;
        font-style: italic;
        color: var(--color-text-secondary);
    }
    /* For inline code: `like this` */
    .main-content :global(:not(pre) > code) {
        background-color: var(--color-overlay-medium);
        padding: 0.2em 0.4em;
        border-radius: 3px;
    }
    /* For the fenced code block container (```) */
    .main-content :global(pre) {
        background-color: var(--color-overlay-medium);
        padding: 1em;
        border-radius: 4px;
        overflow-x: auto;
    }
    /* For the code *inside* the fenced block (removes the extra background) */
    .main-content :global(pre > code) {
        background-color: transparent;
        padding: 0;
    }
    .main-content :global(table) {
        max-width: 100%;
        border-collapse: collapse;
        margin-block: 1.5em;
        font-size: 0.95rem;
        line-height: 1.5;
    }
    .main-content :global(th),
    .main-content :global(td) {
        border: 1px solid var(--color-border-primary);
        padding: 0.6em 0.8em;
    }
    .main-content :global(th) {
        background-color: var(--color-overlay-light);
        font-weight: bold;
    }
    /* This new rule removes borders only from cells inside a table with border="0" */
    .main-content :global(table[border="0"] th),
    .main-content :global(table[border="0"] td) {
        border: none;
    }

    /* --- Rules for the opt-in user-facing float container --- */

    /* The container itself. Using 'flow-root' makes it contain the
       floated table properly, so content *after* the container
       doesn't wrap around the table. */
    .main-content :global(.float-container) {
        display: flow-root;
        margin-bottom: 1.5em; /* Give it some space at the bottom */
    }

    /* A general-purpose class to float elements left */
    .main-content :global(.float-left) {
        float: left;
        margin-right: 1.5em;
        margin-bottom: 0.5em;
    }

    /* A general-purpose class to float elements right */
    .main-content :global(.float-right) {
        float: right;
        margin-left: 1.5em;
        margin-bottom: 0.5em;
    }
    /* This is the key part: Override the default header behavior
     *only* for headers inside our float container. */
    .main-content :global(.float-container > h1),
    .main-content :global(.float-container > h2),
    .main-content :global(.float-container > h3),
    .main-content :global(.float-container > h4),
    .main-content :global(.float-container > h5),
    .main-content :global(.float-container > h6) {
        clear: none; /* Allows the header to sit next to the floated element */
        display: block; /* Resets 'flow-root' back to a normal block */
        overflow: hidden; /* This makes the header's block (and its border) wrap around the float */
    }
</style>
