<script lang="ts">
    import { onMount } from "svelte";
    import type { RenderedPage } from "$lib/bindings";
    import Infobox from "./Infobox.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";

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

    /// Intercept links to open them using the user's default browser, rather
    /// than navigating to them within Chronicler's webview.
    onMount(() => {
        const handleLinkClick = (event: MouseEvent) => {
            // First, ensure the target is an HTMLElement
            if (event.target instanceof HTMLElement) {
                // Now TypeScript knows event.target has DOM methods
                const link = event.target.closest("a");

                if (link && link.href.startsWith("http")) {
                    event.preventDefault();
                    openUrl(link.href);
                }
            }
        };

        document.body.addEventListener("click", handleLinkClick);

        return () => {
            document.body.removeEventListener("click", handleLinkClick);
        };
    });
</script>

<!--
  The main container has a mode class and will control the layout.
  The main content is wrapped in its own div to create a distinct flex item.
  -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<div class="preview-container mode-{mode}" role="document" tabindex="0">
    {#if renderedData}
        <div class="main-content">
            {@html renderedData.rendered_html}
        </div>
    {/if}

    {#if infoboxData}
        <!-- Use <aside> for better semantics -->
        <aside class="infobox-wrapper">
            <Infobox data={infoboxData} />
        </aside>
    {/if}
</div>

<style>
    .preview-container {
        line-height: 1.7;
    }

    /* --- Flexbox Layout --- */

    /* By default, in unified mode, we use a flex row layout. */
    .preview-container.mode-unified {
        display: flex;
        gap: 2rem;
        align-items: flex-start; /* Aligns items to the top */
    }

    .main-content {
        flex: 1; /* Allows the main content to grow and fill available space */
        min-width: 0; /* A crucial flexbox property to prevent content overflow */
    }

    .infobox-wrapper {
        flex-shrink: 0; /* Prevents the infobox from shrinking */
        width: clamp(20rem, 20vw, 28rem);
        order: 2; /* This moves the infobox to the right side of the main content */
    }

    /* In split mode, we stack the items vertically. */
    .preview-container.mode-split {
        display: flex;
        flex-direction: column;
    }

    .preview-container.mode-split .infobox-wrapper {
        order: -1; /* Moves the infobox to the top */
        width: 100%;
        margin-bottom: 2rem;
    }

    /* On smaller screens, always stack the infobox on top for both modes. */
    @media (max-width: 800px) {
        .preview-container.mode-unified {
            flex-direction: column;
        }
        .infobox-wrapper {
            order: -1; /* Move infobox to the top */
            width: 100%;
            margin-bottom: 1rem;
        }
    }

    /* --- Global Styles for Rendered Content --- */
    /* These selectors are specific to target only the main content area. */

    .main-content :global(h1),
    .main-content :global(h2),
    .main-content :global(h3) {
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 0.3em;
        margin-top: 1.5em;
        margin-bottom: 0.3em;
    }
    .main-content :global(h1 + p),
    .main-content :global(h2 + p),
    .main-content :global(h3 + p) {
        margin-top: 0;
    }
    .main-content :global(a.internal-link) {
        color: var(--color-text-link);
        text-decoration: none;
        border-bottom: 1px dotted var(--color-text-link);
        cursor: pointer;
    }
    .main-content :global(span.internal-link.broken) {
        color: var(--color-text-link-broken);
        text-decoration: none;
        border-bottom: 1px dotted var(--color-text-link-broken);
        cursor: help;
    }
    .main-content :global(blockquote) {
        border-left: 3px solid var(--border-color);
        padding-left: 1em;
        margin-left: 0;
        font-style: italic;
        color: var(--ink-light);
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
        width: 100%;
        border-collapse: collapse;
        margin-block: 1.5em;
        font-size: 0.95rem;
        line-height: 1.5;
    }
    .main-content :global(th),
    .main-content :global(td) {
        border: 1px solid var(--border-color);
        padding: 0.6em 0.8em;
        text-align: left;
    }
    .main-content :global(th) {
        background-color: var(--color-overlay-light);
        font-weight: bold;
    }
</style>
