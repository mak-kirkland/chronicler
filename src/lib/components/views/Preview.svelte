<script lang="ts">
    import type { RenderedPage } from "$lib/bindings";
    import Infobox from "$lib/components/infobox/Infobox.svelte";
    import LinkPreview from "$lib/components/ui/LinkPreview.svelte"; // Import the new component
    import { areFooterTagsVisible } from "$lib/settingsStore";
    import {
        tablesort,
        hydrateCarousels,
        enhanceGalleries,
        renderMath,
        observeSize,
    } from "$lib/domActions";
    import { navigateToTag } from "$lib/actions";
    import { t } from "$lib/i18n";
    import { hasInfoboxContent, type InfoboxFrontmatter } from "$lib/infobox";

    let {
        renderedData,
        infoboxData = null,
        mode = "unified",
        onInfoboxEdit,
        fallbackTitle = "",
    } = $props<{
        renderedData: RenderedPage | null;
        infoboxData?: InfoboxFrontmatter | null;
        mode?: "split" | "unified";
        onInfoboxEdit?: () => void;
        fallbackTitle?: string;
    }>();

    // --- Infobox Visibility Logic ---
    const showInfobox = $derived(hasInfoboxContent(infoboxData));

    // --- Narrow-pane Layout ---
    // Below this the floated card leaves too little room for text to wrap
    // beside it, so it unfloats to full width. Measured rather than queried
    // with @container because the placement change is structural (the card
    // moves in the markup), not just a restyle.
    const UNFLOAT_PX = 800;
    let containerEl = $state<HTMLElement | null>(null);
    let isNarrow = $state(false);
    $effect(() => {
        if (!containerEl) return;
        return observeSize(containerEl, (entry) => {
            // Ignore the 0 a hidden tab reports; see observeSize's note.
            const width = entry.contentRect.width;
            if (width > 0) isNarrow = width < UNFLOAT_PX;
        });
    });

    // Unfloated, the card sits between the title and the first paragraph so the
    // title still leads the page. The article arrives as two opaque HTML strings
    // (the backend splits at the first heading), so we cut one more seam after a
    // leading <h1> to have somewhere to put it.
    //
    // A string split rather than moving the node afterwards: the <aside> stays a
    // Svelte-managed child of this template in both layouts, so nothing gets
    // reparented behind Svelte's back.
    const LEAD_H1 = /^\s*<h1\b[^>]*>[\s\S]*?<\/h1>/i;
    const article = $derived.by(() => {
        const before = renderedData?.html_before_toc ?? "";
        const after = renderedData?.html_after_toc ?? "";
        // Only when the page genuinely opens with its title. If anything
        // precedes the first heading, there is no "above the fold" to split.
        if (before.trim() === "") {
            const match = after.match(LEAD_H1);
            if (match) {
                return { lead: match[0], rest: after.slice(match[0].length) };
            }
        }
        // No leading title to sit under: the card goes above the article, which
        // is where an empty `lead` puts it.
        return { lead: "", rest: before + after };
    });

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
    class="preview-container chronicler-content chronicler-note mode-{mode}"
    class:narrow={isNarrow}
    bind:this={containerEl}
    role="document"
    tabindex="0"
    onmouseover={handleMouseOver}
    onmouseout={handleMouseOut}
    use:tablesort={renderedData}
    use:hydrateCarousels={renderedData}
    use:enhanceGalleries={renderedData}
    use:renderMath={renderedData}
>
    {#if showInfobox && !isNarrow}
        <!-- Wide: the card floats, so it has to precede the article in the
             markup to sit at its top right. -->
        <aside class="infobox-wrapper">
            <!-- Pass the edit handler down to the Infobox -->
            <Infobox
                data={infoboxData}
                onEdit={onInfoboxEdit}
                {fallbackTitle}
            />
        </aside>
    {/if}

    {#if renderedData}
        <div class="main-content-wrapper">
            <!--
                The two halves are rendered back to back. The split point used
                to host an inline table of contents, which interrupted the
                article mid-read; contents now live in the context rail beside
                it. The backend still splits the HTML, so the seam stays here
                for anything that wants to insert at the first heading.
            -->
            <div class="main-content">
                {@html article.lead}

                {#if showInfobox && isNarrow}
                    <!-- Narrow: unfloated and full width, sitting under the
                         title rather than above it. -->
                    <aside class="infobox-wrapper">
                        <Infobox
                            data={infoboxData}
                            onEdit={onInfoboxEdit}
                            {fallbackTitle}
                        />
                    </aside>
                {/if}

                {@html article.rest}
            </div>

            {#if showFooterTags && infoboxData?.tags}
                <footer class="page-footer">
                    <span class="footer-label">{$t("preview.tagsLabel")}</span>
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

    /* The preview pane's width is decoupled from the viewport (it's a flex
       child sitting next to the sidebar), so this layout must respond to its
       OWN width, not the viewport. Establish a query container; the infobox
       float width, the TOC width, and the stacking breakpoint below are all
       sized against it via cqi units / @container. */
    /* Deliberately uncapped and not centred. A max-width here plus auto margins
       left visible gutters down both sides of the page, and — because tables
       are `display: block; overflow-x: auto` — it squeezed a wide table sitting
       beside the floated infobox until it scroll-clipped mid-row. The prose
       measure is capped on the paragraphs themselves in preview.css, which
       shortens lines without narrowing the column everything else lives in. */
    .preview-container {
        container: preview-pane / inline-size;
    }

    /* --- Float-based Layout for Unified Mode --- */
    .preview-container.mode-unified .infobox-wrapper {
        float: right;
        width: 20rem;
        /* Space between the card and the text wrapping around it. */
        margin-left: 2.5rem;
        margin-bottom: 1.25rem;
    }

    /* --- Layout for Split Mode (Infobox on top) --- */
    .preview-container.mode-split .infobox-wrapper {
        width: 100%;
        margin-bottom: 2rem;
        clear: both; /* Forces elements to drop below the floated intro images */
    }

    /* --- Narrow pane --- */
    /* The card unfloats to full width. It is also rendered in a different place
       in the markup at this size (under the h1 rather than above the article),
       which is why `narrow` is a measured class rather than a container query. */
    .preview-container.narrow.mode-unified .infobox-wrapper {
        float: none;
        display: block;
        width: 100%;
        margin: 0 0 1.6rem;
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
