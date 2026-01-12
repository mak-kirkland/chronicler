<script lang="ts">
    import type { ContextMenuItem } from "$lib/types";
    import FloatingMenu from "$lib/components/FloatingMenu.svelte";

    let { x, y, actions, onClose } = $props<{
        x: number;
        y: number;
        actions: ContextMenuItem[];
        onClose: () => void;
    }>();

    // ContextMenu mainly acts as a wrapper around FloatingMenu now.
    // FloatingMenu handles the 'click outside', escape key (via global logic potentially,
    // or we add it here), and positioning logic including boundary checks.

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            onClose();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<!--
    We pass a style string to override FloatingMenu's calculated fixed width.
    width: auto + min-width restores the original behavior of growing with content.
-->
<FloatingMenu
    isOpen={true}
    {x}
    {y}
    {onClose}
    className="context-menu"
    style="width: auto; min-width: 180px;"
>
    {#each actions as action}
        {#if action.isSeparator}
            <hr class="separator" />
        {:else}
            <button
                class="menu-item"
                onclick={() => {
                    action.handler();
                    onClose();
                }}
            >
                {action.label}
            </button>
        {/if}
    {/each}
</FloatingMenu>

<style>
    /* We use :global(.context-menu) to target the div rendered by FloatingMenu.
    */
    :global(.context-menu) {
        background-color: var(--color-background-primary) !important;
        border: 1px solid var(--color-border-primary) !important;
        border-radius: 6px;
        box-shadow: 0 4px 12px var(--color-overlay-subtle) !important;
        padding: 0.5rem !important;
    }

    .menu-item {
        display: block;
        width: 100%;
        padding: 0.5rem 1rem;
        border: none;
        background: none;
        text-align: left;
        cursor: pointer;
        border-radius: 4px;
        color: var(--color-text-primary);
        font-size: 0.8rem; /* Reduced from 1rem to match standard dropdowns */
        line-height: normal; /* Removed 1.5 line-height to reduce vertical bulk */
    }
    .menu-item:hover {
        background-color: var(--color-background-tertiary);
        color: var(--color-text-primary);
    }
    .separator {
        border: none;
        border-top: 1px solid var(--color-border-primary);
        margin: 0.5rem 0;
    }
</style>
