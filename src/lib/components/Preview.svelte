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

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<div class="preview-content" role="document" tabindex="0">
    {#if infoboxData}
        <!-- A class is added based on the mode to control the layout -->
        <div class="infobox-wrapper mode-{mode}">
            <Infobox data={infoboxData} />
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
        width: clamp(20rem, 20vw, 28rem);
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
        font-family: var(--font-family-heading);
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
        color: var(--color-text-link);
        text-decoration: none;
        border-bottom: 1px dotted var(--color-text-link);
        cursor: pointer;
    }
    .preview-content :global(span.internal-link.broken) {
        color: var(--color-text-link-broken);
        text-decoration: none;
        border-bottom: 1px dotted var(--color-text-link-broken);
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
        background-color: var(--color-overlay-medium);
        padding: 0.2em 0.4em;
        border-radius: 3px;
    }
    /* For the fenced code block container (```) */
    .preview-content :global(pre) {
        background-color: var(--color-overlay-medium);
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
        background-color: var(--color-overlay-light);
        font-weight: bold;
    }
</style>
