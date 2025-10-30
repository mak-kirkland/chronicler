<script lang="ts">
    import type { RenderedPage } from "$lib/bindings";
    import Infobox from "./Infobox.svelte";
    import TableOfContents from "./TableOfContents.svelte";
    import { isTocVisible } from "$lib/settingsStore";
    import { htmlTableToTabulatorData } from "$lib/tabulator";

    import {
        Tabulator,
        SortModule,
        FilterModule,
        MoveColumnsModule,
        EditModule,
    } from "tabulator-tables";
    import "tabulator-tables/dist/css/tabulator.min.css";

    // Register the modules once when the component is first loaded.
    Tabulator.registerModule([
        SortModule,
        FilterModule,
        MoveColumnsModule,
        EditModule,
    ]);

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

    /**
     * A custom Svelte Action to safely integrate Tabulator and other interactive elements.
     */
    function interactiveContent(node: HTMLElement, htmlContent: string) {
        let tabulatorInstances: Tabulator[] = [];

        function initialize(content: string) {
            node.innerHTML = content;

            // Initialize insert toggles
            const toggles = node.querySelectorAll(".insert-toggle");
            toggles.forEach((button) => {
                button.addEventListener("click", handleToggleClick);
            });

            // Find and initialize Tabulator on tables
            const tables = node.querySelectorAll("table");
            tables.forEach((table) => {
                // Manually parse the table to get data and columns
                const { columns, data } = htmlTableToTabulatorData(table);
                if (columns.length === 0) return;

                // Create a new div container to replace the original table
                const container = document.createElement("div");
                table.parentNode?.replaceChild(container, table);

                const instance = new Tabulator(container, {
                    data: data,
                    columns: columns,
                    layout: "fitData",
                    headerSort: true,
                    // Tell Tabulator to render HTML content in cells
                    htmlOutput: true,
                });
                tabulatorInstances.push(instance);
            });
        }

        function destroy() {
            tabulatorInstances.forEach((instance) => instance.destroy());
            tabulatorInstances = [];
            node.innerHTML = "";
        }

        initialize(htmlContent);

        return {
            update(newHtmlContent: string) {
                destroy();
                initialize(newHtmlContent);
            },
            destroy() {
                destroy();
            },
        };
    }

    /**
     * Handles clicks on the [hide]/[show] buttons within an insert.
     */
    function handleToggleClick(event: Event) {
        const button = event.currentTarget as HTMLElement;
        const container = button.closest(".insert-container");
        if (!container) return;

        // Toggle the 'collapsed' class on the main container.
        const isCollapsed = container.classList.toggle("collapsed");

        // Update the button's text based on the new state.
        button.textContent = isCollapsed ? "[show]" : "[hide]";
    }
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
                <div use:interactiveContent={renderedData.html_before_toc} />

                {#if renderedData.toc.length > 0 && $isTocVisible}
                    <aside class="toc-wrapper">
                        <TableOfContents toc={renderedData.toc} />
                    </aside>
                {/if}

                <div use:interactiveContent={renderedData.html_after_toc} />
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

    /* --- Tabulator Theming using CSS Variables --- */

    /* Main table container */
    .main-content :global(.tabulator) {
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        border-radius: var(--radius-base);
        font-size: 0.95rem;
        margin-block: 1.5em;
        width: max-content; /* Shrink container to fit table content */
        max-width: 100%; /* And prevent overflow on small screens */
    }

    /* Header section */
    .main-content :global(.tabulator .tabulator-header) {
        background-color: var(--color-background-secondary);
        border-bottom: 1px solid var(--color-border-primary);
        color: var(--color-text-secondary);
    }

    /* Header titles and sort arrows */
    .main-content :global(.tabulator .tabulator-col .tabulator-col-content) {
        padding: 0.6em 0.8em;
    }

    /* Header filter input fields */
    .main-content
        :global(
            .tabulator
                .tabulator-header
                .tabulator-col
                .tabulator-header-filter
                input
        ) {
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
        border: 1px solid var(--color-border-primary);
        border-radius: 3px;
        padding: 0.3rem;
        margin-top: 4px;
    }

    /* Table rows */
    .main-content :global(.tabulator .tabulator-tableHolder .tabulator-row) {
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
    }

    /* Row hover effect */
    .main-content
        :global(.tabulator .tabulator-tableHolder .tabulator-row:hover) {
        background-color: var(--color-overlay-medium);
    }

    /* Individual cells */
    .main-content :global(.tabulator .tabulator-row .tabulator-cell) {
        border-right: 1px solid var(--color-border-primary);
        padding: 0.6em 0.8em;
    }
</style>
