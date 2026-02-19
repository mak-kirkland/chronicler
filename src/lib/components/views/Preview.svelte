<script lang="ts">
    import type { RenderedPage } from "$lib/bindings";
    import Infobox from "$lib/components/infobox/Infobox.svelte";
    import TableOfContents from "$lib/components/views/TableOfContents.svelte";
    import LinkPreview from "$lib/components/ui/LinkPreview.svelte"; // Import the new component
    import { isTocVisible, areFooterTagsVisible } from "$lib/settingsStore";
    import {
        tablesort,
        hydrateCarousels,
        enhanceGalleries,
        renderMath,
    } from "$lib/domActions";
    import { navigateToTag } from "$lib/actions";
    import { hasInfoboxContent, type InfoboxFrontmatter } from "$lib/infobox";

    let {
        renderedData,
        infoboxData = null,
        mode = "unified",
        onInfoboxEdit,
    } = $props<{
        renderedData: RenderedPage | null;
        infoboxData?: InfoboxFrontmatter | null;
        mode?: "split" | "unified";
        onInfoboxEdit?: () => void;
    }>();

    // --- Infobox Visibility Logic ---
    const showInfobox = $derived(hasInfoboxContent(infoboxData));

    // --- Footer Tag Logic ---
    // Only show footer tags if there ARE tags, and either the global setting says so
    // OR the sidebar infobox is hidden.
    const showFooterTags = $derived(
        infoboxData?.tags &&
            Array.isArray(infoboxData.tags) &&
            infoboxData.tags.length > 0 &&
            ($areFooterTagsVisible || !showInfobox),
    );

    // --- Link Preview Logic ---
    let hoveredLinkEl = $state<HTMLElement | null>(null);
    let hoveredLinkPath = $state<string | null>(null);

    function handleMouseOver(event: MouseEvent) {
        const target = event.target as HTMLElement;

        // We check for 'internal-link' class which identifies wikilinks.
        if (
            target.tagName === "A" &&
            target.classList.contains("internal-link")
        ) {
            const dataPath = target.getAttribute("data-path");
            const broken = target.classList.contains("broken");

            if (!broken) {
                hoveredLinkEl = target;
                hoveredLinkPath = dataPath;
            }
        }
    }

    function handleMouseOut(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (
            target.tagName === "A" &&
            target.classList.contains("internal-link")
        ) {
            hoveredLinkEl = null;
            hoveredLinkPath = null;
        }
    }
</script>

<!--
  The LinkPreview component manages its own visibility based on the props we pass it.
-->
<LinkPreview anchorEl={hoveredLinkEl} targetPath={hoveredLinkPath} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex, a11y_mouse_events_have_key_events -->
<div
    class="preview-container chronicler-content mode-{mode}"
    role="document"
    tabindex="0"
    onmouseover={handleMouseOver}
    onmouseout={handleMouseOut}
    use:tablesort={renderedData}
    use:hydrateCarousels={renderedData}
    use:enhanceGalleries={renderedData}
    use:renderMath={renderedData}
>
    {#if showInfobox}
        <!-- Use <aside> for better semantics. It's floated, so order in HTML matters. -->
        <aside class="infobox-wrapper">
            <!-- Pass the edit handler down to the Infobox -->
            <Infobox data={infoboxData} onEdit={onInfoboxEdit} />
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
    /* Note: Most content styling has been moved to src/preview.css
       and scoped to the .chronicler-content class.
       This block now only handles high-level layout.
    */

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
        clear: both; /* Forces elements to drop below the floated intro images */
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
