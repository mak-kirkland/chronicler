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
    import { fade } from "svelte/transition";
    import { calculatePopupPosition } from "$lib/utils";

    let { anchorEl = null, targetPath = null } = $props<{
        anchorEl: HTMLElement | null;
        targetPath: string | null;
    }>();

    let infoboxData = $state<InfoboxFrontmatter | null>(null);
    let isVisible = $state(false);

    // --- Layout State ---
    // We bind to clientHeight to measure the natural height of the content
    // before we clamp it with max-height.
    let popupHeight = $state(0);

    // The calculated position and constraints
    let pos = $state({ top: 0, left: 0, maxHeight: 400, side: "right" });

    const POPUP_WIDTH = 380;

    // --- 1. Positioning Effect ---
    // Runs whenever visibility changes or the anchor moves/changes.
    $effect(() => {
        if (!isVisible || !anchorEl) return;

        const rect = anchorEl.getBoundingClientRect();
        const viewport = { w: window.innerWidth, h: window.innerHeight };

        // If height is 0 (first render), use a safe fallback (200px)
        // so the utility can make a reasonable initial guess.
        const currentH = popupHeight || 200;

        // Calculate strict coordinates using the shared utility.
        // This utility accounts for screen edges and flips the popup if needed.
        const calculated = calculatePopupPosition(
            rect,
            POPUP_WIDTH,
            currentH,
            viewport,
        );

        // Update state directly
        pos = {
            top: calculated.top,
            left: calculated.left,
            maxHeight: calculated.maxHeight,
            side: calculated.side as "left" | "right",
        };
    });

    // --- 2. Data Fetching Effect ---
    // Fetches the page data when the targetPath changes.
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
                        popupHeight = 0; // Reset height to force re-measure on next tick
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

{#if isVisible && infoboxData && anchorEl}
    <!--
      Outer Container:
      - We apply dynamic coordinates via style (because they change).
      - Static layout properties are moved back to the CSS class.
      - We use the CSS class with !important rules to ensure the element
        is instantly removed from the flow, preventing layout thrashing.
    -->
    <div
        class="preview-popup-container"
        style="
            top: {pos.top}px;
            left: {pos.left}px;
            width: {POPUP_WIDTH}px;
            max-height: {pos.maxHeight}px;
        "
    >
        <!--
           Inner Popup:
           - Contains the visual styles (border, background).
           - Handles transitions.
           - Binds height for measurement.
        -->
        <div
            class="preview-popup side-{pos.side}"
            bind:clientHeight={popupHeight}
            transition:fade={{ duration: 150 }}
            style="visibility: {popupHeight === 0 ? 'hidden' : 'visible'};"
        >
            <Infobox data={infoboxData} onEdit={undefined} />

            <!--
               Visual Mask:
               A gradient overlay at the bottom that fades content out.
               This insinuates "more content below" without requiring scrollbars.
            -->
            <div class="overflow-fade"></div>
        </div>
    </div>
{/if}

<style>
    .preview-popup-container {
        /* * Critical Layout Properties:
         * We use !important to ensure these are never overridden by global styles,
         * defaults, or parent flex containers. This prevents the "pushing content down" bug.
         */
        position: fixed !important;
        z-index: 9999 !important;
        display: flex !important;
        flex-direction: column !important;
        pointer-events: none !important;

        /* Reset any potential default margins */
        margin: 0;
        padding: 0;
    }

    .preview-popup {
        background: var(--color-background-primary);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-base);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        font-size: 0.85rem;
        position: relative;
        width: 100%;
        box-sizing: border-box;

        /* Clip content that exceeds the calculated max-height */
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    /* Infobox Styling Overrides for Preview Context */
    .preview-popup :global(.infobox) {
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

    /* The Fade Out Effect */
    .overflow-fade {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 40px; /* Height of the fade gradient */
        background: linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0) 0%,
            var(--color-background-primary) 100%
        );
        z-index: 10;
        pointer-events: none;
        border-bottom-left-radius: var(--radius-base);
        border-bottom-right-radius: var(--radius-base);
    }
</style>
