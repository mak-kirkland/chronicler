<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import ThemedIcon from "./ThemedIcon.svelte";

    let {
        children,
        title = "Modal Title",
        onClose = () => {},
        showCloseButton = true,
    } = $props<{
        children: any;
        title?: string;
        onClose?: () => void;
        showCloseButton?: boolean;
    }>();

    let modalElement: HTMLDivElement;

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            onClose();
        }
    }

    onMount(() => {
        window.addEventListener("keydown", handleKeydown);
        // Focus the modal itself when it's mounted
        if (modalElement) {
            modalElement.focus();
        }
    });

    onDestroy(() => {
        window.removeEventListener("keydown", handleKeydown);
    });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="modal-backdrop" onclick={onClose}>
    <div
        bind:this={modalElement}
        class="modal-content"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        onclick={(event) => event.stopPropagation()}
    >
        <div class="modal-header">
            <h3>{title}</h3>
            {#if showCloseButton}
                <button
                    class="close-btn"
                    onclick={onClose}
                    aria-label="Close modal"
                >
                    <ThemedIcon type="close" />
                </button>
            {/if}
        </div>
        <div class="modal-body">
            <div class="modal-body-wrapper">
                {@render children()}
            </div>
        </div>
    </div>
</div>

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    .modal-content {
        background-color: var(--color-background-primary);
        padding: 2rem;
        border-radius: 8px;
        border: 2px solid var(--color-border-primary);
        width: 100%;
        max-width: 600px;
        box-shadow: 0 5px 15px var(--color-overlay-light);
        color: var(--color-text-primary);
    }
    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--color-border-primary);
        padding-bottom: 1rem;
        margin-bottom: 1rem;
    }
    .modal-header h3 {
        font-size: 1.5rem;
        margin: 0;
    }
    .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        color: var(--color-text-secondary);
        cursor: pointer;
        padding: 0;
    }
    .modal-body {
        max-height: 70vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    .modal-body-wrapper {
        /* Add padding so content doesn't get clipped by the scroll container */
        padding: 1rem 1rem 1rem 0.5rem;
    }
</style>
