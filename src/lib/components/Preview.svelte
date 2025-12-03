<script lang="ts">
    import type { RenderedPage } from "$lib/bindings";
    import Infobox from "./Infobox.svelte";
    import TableOfContents from "./TableOfContents.svelte";
    import { isTocVisible, areFooterTagsVisible } from "$lib/settingsStore";
    import { tablesort } from "$lib/domActions";
    import { navigateToTag } from "$lib/actions";
    import { buildInfoboxLayout } from "$lib/utils";

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

    // --- Infobox Visibility Logic ---
    // Calculate if the infobox has "real" content (images, errors, or key-value pairs).
    // If it only has metadata (title, subtitle, tags), we consider it "empty" to reduce clutter.

    const layoutItems = $derived(buildInfoboxLayout(infoboxData));

    const hasImages = $derived(
        infoboxData?.images &&
            Array.isArray(infoboxData.images) &&
            infoboxData.images.length > 0,
    );

    const hasError = $derived(!!infoboxData?.error);

    const hasContentFields = $derived(layoutItems.length > 0);

    // Show the infobox ONLY if it has images, an error, or actual data fields.
    const showInfobox = $derived(
        infoboxData && (hasImages || hasError || hasContentFields),
    );

    // --- Footer Tag Logic ---
    // Show tags in the footer if:
    // 1. There are tags to show.
    // 2. AND (The user enabled footer tags globally OR the infobox is hidden).
    const showFooterTags = $derived(
        infoboxData?.tags &&
            Array.isArray(infoboxData.tags) &&
            infoboxData.tags.length > 0 &&
            ($areFooterTagsVisible || !showInfobox),
    );
</script>

<!--
  The main container has a mode class and will control the layout.
  The main content is wrapped in its own div to create a distinct flex item.
  -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<div
    class="preview-container mode-{mode}"
    role="document"
    tabindex="0"
    use:tablesort={renderedData}
>
    {#if showInfobox}
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

            {#if showFooterTags && infoboxData?.tags}
                <footer class="page-footer">
                    <span class="footer-label">Tags:</span>
                    <div class="footer-tags">
                        {#each infoboxData.tags as tag}
                            <button
                                class="footer-tag-link"
                                onclick={() => navigateToTag(tag)}
                            >
                                {tag}
                            </button>
                            <span class="separator">|</span>
                        {/each}
                    </div>
                </footer>
            {/if}
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

    /* --- Rules for the opt-in user-facing image gallery --- */

    /* --- 1. CONTAINER & DEFAULTS --- */
    .main-content :global(.gallery) {
        --gallery-height: 300px; /* Default */
        display: grid;
        /* Magic grid: creates as many 200px columns as will fit */
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
        margin-block: 1.5em;
        align-items: start;
    }

    /* Preset Overrides */
    .main-content :global(.gallery.small) {
        --gallery-height: 150px;
    }
    .main-content :global(.gallery.large) {
        --gallery-height: 450px;
    }

    /* --- 2. SHARED IMAGE STYLES --- */
    /* Apply these base styles to ALL images inside a gallery */
    .main-content :global(.gallery img) {
        width: 100%;
        height: var(--gallery-height);
        object-fit: contain;
        background-color: var(--color-background-secondary);
        display: block;
        margin: 0;
    }

    /* --- 3. CASE A: FIGURE WRAPPERS --- */
    .main-content :global(.gallery figure) {
        margin: 0;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--color-border-primary);
        border-radius: 4px;
        overflow: hidden; /* Clips the corners of the image inside */
    }

    /* Add the separator line specifically for images inside figures */
    .main-content :global(.gallery figure img) {
        border-bottom: 1px solid var(--color-border-primary);
    }

    /* If a figure has NO caption, the image is the last child.
       Remove the separator line so we don't get a double border at the bottom. */
    .main-content :global(.gallery figure > img:last-child) {
        border-bottom: none;
    }

    /* --- 4. CASE B: BARE IMAGES --- */
    /* Add the outer border specifically for images that are direct children */
    .main-content :global(.gallery > img) {
        border: 1px solid var(--color-border-primary);
        border-radius: 4px;
    }

    /* --- 5. CAPTIONS --- */
    .main-content :global(.gallery figcaption) {
        padding: 0.5rem;
        font-size: 0.9rem;
        text-align: center;
        color: var(--color-text-secondary);
        background-color: var(--color-background-secondary);
    }

    /* * This rule targets all paragraphs inside the rendered content area.
     * We reset them to 0 to remove the browser's default, oversized margins
     * when using inline <p> tags.
     */
    .main-content :global(p) {
        margin-block: 0;
    }

    /*
     * This rule targets any paragraph that directly follows another paragraph.
     * We add a top margin using the 'rem' unit. This ensures the space
     * between paragraphs scales proportionally with the font size set by the user's slider.
     */
    .main-content :global(p + p) {
        margin-block-start: 1rem;
    }

    /** Global styles for the sortable table */

    .main-content :global(.sortable-table thead th) {
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .main-content :global(.sortable-table thead th:hover) {
        background-color: var(--color-background-secondary);
    }

    /* These styles add the little sort-indicator arrows */
    .main-content :global(.sortable-table th[role="columnheader"]::after) {
        content: " \25B2"; /* Up arrow */
        font-size: 0.8em;
        opacity: 0.3;
    }

    .main-content :global(.sortable-table th[aria-sort="descending"]::after) {
        content: " \25BC"; /* Down arrow */
        opacity: 1;
    }

    .main-content :global(.sortable-table th[aria-sort="ascending"]::after) {
        content: " \25B2"; /* Up arrow */
        opacity: 1;
    }

    /* --- Footer Styles --- */
    .page-footer {
        margin-top: 3rem;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border-primary);
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        display: flex;
        gap: 0.5rem;
        align-items: baseline;
        clear: both; /* Ensure it sits below floated elements like the infobox */
    }
    .footer-label {
        font-weight: bold;
    }
    .footer-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .footer-tag-link {
        background: none;
        border: none;
        padding: 0;
        color: var(--color-text-link);
        cursor: pointer;
        text-decoration: none;
    }
    .footer-tag-link:hover {
        text-decoration: underline;
        color: var(--color-text-primary);
    }
    .separator {
        color: var(--color-text-secondary);
        opacity: 0.5;
        user-select: none;
    }
    /* Hide the last separator */
    .footer-tags .separator:last-child {
        display: none;
    }
</style>
