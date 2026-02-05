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
        let finalWidth = 0;

        // Scenario A: Anchor to an Element (Dropdowns)
        if (anchorEl) {
            const rect = anchorEl.getBoundingClientRect();
            top = rect.bottom + 4; // 4px gap
            left = rect.left;
            finalWidth = width || rect.width;
        }
        // Scenario B: Raw Coordinates (Context Menu)
        else {
            top = y;
            left = x;
            finalWidth = width || 180; // Default min-width for context menus
        }

        // --- Boundary Checks (Basic) ---
        // We do this after render if possible, but for now we do a simple check
        // using window dimensions.
        const { innerWidth, innerHeight } = window;

        // If we have the menu element, we can prevent overflow
        if (menuEl) {
            const menuRect = menuEl.getBoundingClientRect();

            if (left + menuRect.width > innerWidth) {
                left = innerWidth - menuRect.width - 10;
            }

            if (top + menuRect.height > innerHeight) {
                // Flip upwards if not enough space below
                top = innerHeight - menuRect.height - 10;
            }
        }

        calculatedStyle = `top: ${top}px; left: ${left}px; width: ${finalWidth}px;`;
    }

    // Update position when props change or when opened
    $effect(() => {
        if (isOpen) {
            // Tick ensures the element renders before we measure it for boundary checks
            tick().then(updatePosition);
        }
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
