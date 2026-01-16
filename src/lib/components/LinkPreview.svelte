<script lang="ts">
    /**
     * LinkPreview.svelte
     *
     * A component that displays a hovering preview of a page's infobox.
     *
     */
    import { buildPageView } from "$lib/commands";
    import { hasInfoboxContent, type InfoboxFrontmatter } from "$lib/infobox";
    import Infobox from "./Infobox.svelte";
    import HoverPreview from "./HoverPreview.svelte";

    let { anchorEl = null, targetPath = null } = $props<{
        anchorEl: HTMLElement | null;
        targetPath: string | null;
    }>();

    let infoboxData = $state<InfoboxFrontmatter | null>(null);
    let isVisible = $state(false);

    // --- Data Fetching Effect ---
    $effect(() => {
        // If no valid target, hide immediately
        if (!targetPath || !anchorEl || targetPath === "#") {
            isVisible = false;
            infoboxData = null;
            return;
        }

        // Debounce requests by 300ms to prevent spamming the backend
        // while the user moves the mouse across multiple links.
        const timer = setTimeout(() => {
            buildPageView(targetPath)
                .then((data) => {
                    const frontmatter =
                        data.rendered_page?.processed_frontmatter;

                    if (hasInfoboxContent(frontmatter)) {
                        // We strictly hide tags in the popup to keep it compact
                        infoboxData = { ...frontmatter, tags: [] };
                        isVisible = true;
                    } else {
                        isVisible = false;
                    }
                })
                .catch(() => {
                    isVisible = false;
                });
        }, 300);

        return () => clearTimeout(timer);
    });
</script>

<HoverPreview {anchorEl} {isVisible} width={380}>
    {#if infoboxData}
        <div class="infobox-container">
            <Infobox data={infoboxData} onEdit={undefined} />
        </div>
    {/if}
</HoverPreview>

<style>
    /* Infobox Styling Overrides for Preview Context */
    .infobox-container :global(.infobox) {
        border: none;
        background: var(--color-background-primary);
        padding: var(--space-sm);
        margin: 0;
        position: relative;
        z-index: 1;
        border-radius: var(--radius-base);

        /* Ensure the infobox consumes height but doesn't force scroll */
        max-height: 100%;
    }
</style>
