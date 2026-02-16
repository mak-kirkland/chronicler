<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { Snippet } from "svelte";
    import { modalStackDepth, closeModal, popModal } from "$lib/modalStore";
    import Icon from "$lib/components/ui/Icon.svelte";

    let {
        children,
        title = "Modal Title",
        onClose = closeModal,
        showCloseButton = true,
    } = $props<{
        children: Snippet;
        title?: string;
        onClose?: () => void;
        showCloseButton?: boolean;
    }>();

    let modalElement: HTMLDivElement;

    // Track where the click started
    let mouseDownTarget: EventTarget | null = null;

    function handleBackdropMouseDown(event: MouseEvent) {
        mouseDownTarget = event.target;
    }

    function handleBackdropClick(event: MouseEvent) {
        // Only close if the mousedown happened on the backdrop (event.currentTarget)
        // This ensures clicks starting inside the content (e.g. text selection) don't close the modal
        if (mouseDownTarget === event.currentTarget) {
            onClose();
        }
        mouseDownTarget = null;
    }

    // Show back button if there's more than one modal in the stack
    const showBackButton = $derived($modalStackDepth > 1);

    function handleBack() {
        // Pop this modal, revealing the one beneath
        popModal();
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            // Escape always closes all modals
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
<div
    class="modal-backdrop"
    onmousedown={handleBackdropMouseDown}
    onclick={handleBackdropClick}
>
    <div
        bind:this={modalElement}
        class="modal-content"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        onclick={(event) => event.stopPropagation()}
    >
        <div class="modal-header">
            <div class="header-left">
                {#if showBackButton}
                    <button
                        class="back-btn"
                        onclick={handleBack}
                        aria-label="Go back"
                    >
                        <Icon type="back" />
                    </button>
                {/if}
                <h3>{title}</h3>
            </div>
            {#if showCloseButton}
                <button
                    class="close-btn"
                    onclick={onClose}
                    aria-label="Close modal"
                >
                    <Icon type="close" />
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
    .header-left {
        display: flex;
        align-items: center;
        gap: 0.5rem;
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
    .back-btn {
        background: none;
        border: none;
        font-size: 1.25rem;
        color: var(--color-text-secondary);
        cursor: pointer;
        padding: 0.25rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition:
            background-color 0.2s,
            color 0.2s;
    }
    .back-btn:hover {
        background-color: var(--color-overlay-light);
        color: var(--color-text-primary);
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
