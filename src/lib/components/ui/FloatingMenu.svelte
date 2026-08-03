<script lang="ts">
    /**
     * FloatingMenu.svelte
     * A reusable component for positioning dropdowns and context menus.
     * Handles:
     * 1. Fixed positioning relative to an anchor element OR raw coordinates.
     * 2. "Click Outside" detection to close.
     * 3. Window resize/scroll handling.
     * 4. Viewport collision detection (basic).
     * 5. Portaling to body to escape parent stacking contexts.
     */
    import { tick } from "svelte";
    import { portal } from "$lib/domActions";

    let {
        isOpen = false,
        anchorEl = null,
        x = 0,
        y = 0,
        width = undefined, // Optional override
        align = "start",
        onClose,
        children,
        className = "",
        style = "",
        menuEl = $bindable(null),
    } = $props<{
        isOpen: boolean;
        anchorEl?: HTMLElement | null; // If provided, positions relative to this
        x?: number; // If anchorEl is missing, uses this x
        y?: number; // If anchorEl is missing, uses this y
        width?: number; // Optional manual width
        /**
         * Which edge of the menu lines up with the anchor. `start` (default)
         * aligns the left edges. Use `end` when the trigger is a small control
         * at the right of a wider group — a chevron on a split button, say —
         * so the menu opens under the thing you actually clicked instead of
         * making you drag the pointer back across the group.
         */
        align?: "start" | "end";
        onClose: () => void;
        children: any;
        className?: string;
        style?: string;
        menuEl?: HTMLDivElement | null;
    }>();
    let calculatedStyle = $state("");

    // --- Positioning Logic ---
    function updatePosition() {
        if (!isOpen) return;

        let top = 0;
        let left = 0;
        // Only set when a width is actually known. In coordinate mode there is
        // nothing to measure against, so the menu sizes to its content and
        // callers don't have to undo a made-up pixel width.
        let finalWidth: number | null = null;

        // Scenario A: Anchor to an Element (Dropdowns)
        const anchorRect = anchorEl?.getBoundingClientRect() ?? null;
        if (anchorRect) {
            const w = width ?? anchorRect.width;
            top = anchorRect.bottom + 4; // 4px gap
            finalWidth = w;
            left = align === "end" ? anchorRect.right - w : anchorRect.left;
        }
        // Scenario B: Raw Coordinates (Context Menu)
        else {
            top = y;
            left = x;
            finalWidth = width ?? null;
        }

        // --- Boundary Checks ---
        const { innerWidth, innerHeight } = window;

        // If we have the menu element, we can prevent overflow
        if (menuEl) {
            const menuRect = menuEl.getBoundingClientRect();

            if (left + menuRect.width > innerWidth) {
                left = innerWidth - menuRect.width - 10;
            }
            // End-aligned menus, and narrow windows generally, can push the
            // left edge off-screen — clamp after the right-edge check so the
            // menu stays reachable either way.
            if (left < 10) {
                left = 10;
            }

            if (top + menuRect.height > innerHeight) {
                // Not enough room below. For an anchored menu, flip it above
                // the anchor so it still reads as belonging to that control —
                // a trigger near the bottom of the window (the sidebar's New
                // Page button, say) would otherwise pin its menu to the foot of
                // the screen, covering the very button that opened it.
                const flipped = anchorRect
                    ? anchorRect.top - menuRect.height - 4
                    : y - menuRect.height;

                // Only flip if the menu actually fits above; otherwise clamp
                // into the viewport as before.
                top =
                    flipped >= 10
                        ? flipped
                        : Math.max(10, innerHeight - menuRect.height - 10);
            }
        }

        calculatedStyle =
            `top: ${top}px; left: ${left}px; ` +
            (finalWidth !== null
                ? `width: ${finalWidth}px;`
                : "min-width: 180px;");
    }

    // Reposition when opened *or* when any positioning input changes. The
    // reads have to happen synchronously here to be tracked — updatePosition
    // runs in a microtask, outside the effect's dependency capture — so a
    // menu whose anchor or alignment moves doesn't keep a stale position.
    $effect(() => {
        if (!isOpen) return;
        void anchorEl;
        void x;
        void y;
        void width;
        void align;
        // Tick ensures the element renders before we measure it for boundary checks
        tick().then(updatePosition);
    });

    // Content can arrive after the menu opens — the vault switcher loads its
    // recent list asynchronously — which changes the height the flip and the
    // bottom clamp were computed against. Re-measure when the box changes.
    $effect(() => {
        if (!isOpen || !menuEl) return;
        const ro = new ResizeObserver(() => updatePosition());
        ro.observe(menuEl);
        return () => ro.disconnect();
    });

    // --- Global Event Listeners ---
    function handleGlobalEvents() {
        if (!isOpen) return;
        // If resizing or scrolling, we generally want to close for safety
        onClose();
    }

    function handleClickOutside(event: MouseEvent) {
        if (!isOpen) return;
        const target = event.target as Node;

        // If click is inside the menu, do nothing
        if (menuEl && menuEl.contains(target)) return;

        // If click is on the anchor (trigger), let the parent handle the toggle
        // (usually the parent logic will toggle isOpen off anyway)
        if (anchorEl && anchorEl.contains(target)) return;

        onClose();
    }

    // Attach listeners strictly when open to save performance
    $effect(() => {
        if (isOpen) {
            // Timeout ensures the click that opened it doesn't immediately close it
            const timer = setTimeout(() => {
                window.addEventListener("click", handleClickOutside);
            }, 0);

            return () => {
                clearTimeout(timer);
                window.removeEventListener("click", handleClickOutside);
            };
        }
    });
</script>

<svelte:window onresize={handleGlobalEvents} onscroll={handleGlobalEvents} />

{#if isOpen}
    <div
        bind:this={menuEl}
        use:portal
        class="dropdown-menu {className}"
        style="position: fixed; {calculatedStyle} z-index: 9999; {style}"
    >
        {@render children()}
    </div>
{/if}
