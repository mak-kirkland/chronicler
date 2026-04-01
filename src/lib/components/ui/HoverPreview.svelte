<script lang="ts">
    /**
     * HoverPreview.svelte
     *
     * A generic component that handles the positioning, visibility, and layout
     * of a hover preview popup. It delegates the actual content rendering to a slot.
     */
    import { fade } from "svelte/transition";
    import { calculatePopupPosition } from "$lib/utils";

    let {
        anchorEl = null,
        isVisible = false,
        width = 380,
        preferredSide = null,
        children,
    } = $props<{
        anchorEl: HTMLElement | null;
        isVisible: boolean;
        width?: number;
        /**
         * Optional side preference: "left" or "right".
         * When set, forces the popup to appear on the specified side of the anchor,
         * useful when multiple previews share the same anchor element and need
         * to appear side by side instead of overlapping.
         */
        preferredSide?: "left" | "right" | null;
        children?: import("svelte").Snippet;
    }>();

    // --- Layout State ---
    let popupHeight = $state(0);
    // Default position off-screen until calculated
    let pos = $state({ top: 0, left: 0, maxHeight: 400, side: "right" });

    // --- Positioning Effect ---
    $effect(() => {
        if (!isVisible || !anchorEl) return;

        const rect = anchorEl.getBoundingClientRect();
        const viewport = { w: window.innerWidth, h: window.innerHeight };
        const currentH = popupHeight || 200;

        const calculated = calculatePopupPosition(
            rect,
            width,
            currentH,
            viewport,
        );

        // If a preferredSide is specified and differs from the natural side,
        // recalculate the left position to force the popup to the biased side.
        let finalLeft = calculated.left;
        let finalSide = calculated.side;

        if (preferredSide && preferredSide !== calculated.side) {
            const GAP = 8; // px gap between anchor and popup
            if (preferredSide === "right") {
                finalLeft = rect.right + GAP;
            } else {
                finalLeft = rect.left - width - GAP;
            }
            finalSide = preferredSide;

            // Clamp to viewport edges so the popup doesn't go off-screen
            if (finalLeft < 4) finalLeft = 4;
            if (finalLeft + width > viewport.w - 4) {
                finalLeft = viewport.w - width - 4;
            }
        }

        pos = {
            top: calculated.top,
            left: finalLeft,
            maxHeight: calculated.maxHeight,
            side: finalSide as "left" | "right",
        };
    });
</script>

{#if isVisible && anchorEl}
    <!--
      Outer Container:
      - We apply dynamic coordinates via style.
      - Uses fixed positioning to float above everything.
    -->
    <div
        class="preview-popup-container"
        style="
            top: {pos.top}px;
            left: {pos.left}px;
            width: {width}px;
            max-height: {pos.maxHeight}px;
        "
    >
        <!--
           Inner Popup:
           - Visual styles (border, background).
           - Binds height for measurement.
        -->
        <div
            class="preview-popup side-{pos.side}"
            bind:clientHeight={popupHeight}
            transition:fade={{ duration: 150 }}
            style="visibility: {popupHeight === 0 ? 'hidden' : 'visible'};"
        >
            {@render children?.()}

            <!-- Visual Mask -->
            <div class="overflow-fade"></div>
        </div>
    </div>
{/if}

<style>
    .preview-popup-container {
        position: fixed !important;
        z-index: 9999 !important;
        display: flex !important;
        flex-direction: column !important;
        pointer-events: none !important;
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
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .overflow-fade {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 40px;
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
