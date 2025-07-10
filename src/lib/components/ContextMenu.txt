<script lang="ts">
    import { onMount } from "svelte";
    import type { ContextMenuItem } from "$lib/types";

    let { x, y, actions, onClose } = $props<{
        x: number;
        y: number;
        actions: ContextMenuItem[];
        onClose: () => void;
    }>();

    let menuElement: HTMLDivElement;

    onMount(() => {
        // This function handles clicks outside the menu to close it
        function handleClickOutside(event: MouseEvent) {
            if (menuElement && !menuElement.contains(event.target as Node)) {
                onClose();
            }
        }

        function handleKeydown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                onClose();
            }
        }

        // Use setTimeout to ensure this listener is added after the current event cycle,
        // preventing the click that opened the menu from immediately closing it.
        setTimeout(() => {
            window.addEventListener("click", handleClickOutside);
            window.addEventListener("keydown", handleKeydown);
        }, 0);

        // Adjust position if menu is too close to the edge of the viewport
        const { innerWidth, innerHeight } = window;
        const { offsetWidth, offsetHeight } = menuElement;

        if (x + offsetWidth > innerWidth) {
            x = innerWidth - offsetWidth - 10;
        }
        if (y + offsetHeight > innerHeight) {
            y = innerHeight - offsetHeight - 10;
        }

        // Cleanup function to remove listeners when the component is destroyed
        return () => {
            window.removeEventListener("click", handleClickOutside);
            window.removeEventListener("keydown", handleKeydown);
        };
    });

    function handleActionClick(handler: () => void) {
        handler();
        onClose();
    }
</script>

<div
    bind:this={menuElement}
    class="context-menu"
    style="top: {y}px; left: {x}px;"
    role="menu"
>
    {#each actions as action}
        {#if action.isSeparator}
            <hr class="separator" />
        {:else}
            <button
                class="menu-item"
                onclick={() => handleActionClick(action.handler)}
            >
                {action.label}
            </button>
        {/if}
    {/each}
</div>

<style>
    .context-menu {
        position: fixed;
        z-index: 1000;
        background-color: var(--parchment);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 0.5rem;
        min-width: 180px;
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
        color: var(--ink);
    }
    .menu-item:hover {
        background-color: var(--parchment-dark);
    }
    .separator {
        border: none;
        border-top: 1px solid var(--border-color);
        margin: 0.5rem 0;
    }
</style>
