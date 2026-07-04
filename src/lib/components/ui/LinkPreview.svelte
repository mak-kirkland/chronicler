<script lang="ts">
    /**
     * LinkPreview.svelte
     *
     * A component that displays a hovering preview of a page: its infobox,
     * or the lead paragraph(s) for pages without one.
     */
    import { buildPageView } from "$lib/commands";
    import { hasInfoboxContent, type InfoboxFrontmatter } from "$lib/infobox";
    import { fileStemString } from "$lib/utils";
    import PagePreviewContent from "$lib/components/ui/PagePreviewContent.svelte";
    import HoverPreview from "$lib/components/ui/HoverPreview.svelte";

    let {
        anchorEl = null,
        targetPath = null,
        preferredSide = null,
        positionToken = 0,
    } = $props<{
        anchorEl: HTMLElement | null;
        targetPath: string | null;
        preferredSide?: "left" | "right" | null;
        positionToken?: number;
    }>();

    let infoboxData = $state<InfoboxFrontmatter | null>(null);
    let fallbackHtml = $state("");
    let isVisible = $state(false);

    // Derive a human-readable title from the file path (strip directory + extension)
    const fallbackTitle = $derived(
        targetPath ? fileStemString(targetPath) || "" : "",
    );

    // --- Data Fetching Effect ---
    $effect(() => {
        // If no valid target, hide immediately
        if (!targetPath || !anchorEl || targetPath === "#") {
            isVisible = false;
            infoboxData = null;
            fallbackHtml = "";
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
                        fallbackHtml = "";
                        isVisible = true;
                    } else {
                        // No infobox: fall back to the lead paragraph(s) — the
                        // rendered HTML before the first heading. Empty for
                        // pages that start with a heading, in which case the
                        // popup stays hidden as before.
                        infoboxData = null;
                        fallbackHtml = (
                            data.rendered_page?.html_before_toc ?? ""
                        ).trim();
                        isVisible = fallbackHtml.length > 0;
                    }
                })
                .catch(() => {
                    isVisible = false;
                });
        }, 300);

        return () => clearTimeout(timer);
    });
</script>

<HoverPreview {anchorEl} {isVisible} width={380} {preferredSide} {positionToken}>
    {#if infoboxData || fallbackHtml}
        <PagePreviewContent infobox={infoboxData} {fallbackHtml} {fallbackTitle} />
    {/if}
</HoverPreview>
