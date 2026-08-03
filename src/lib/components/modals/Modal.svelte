<script lang="ts">
    import { onMount, onDestroy, getContext } from "svelte";
    import type { Snippet } from "svelte";
    import {
        modalStackDepth,
        closeModal,
        popModal,
        MODAL_IS_TOP,
        type ModalTopState,
    } from "$lib/modalStore";
    import Icon from "$lib/components/ui/Icon.svelte";
    import { t } from "$lib/i18n";

    let {
        children,
        title = "Modal Title",
        onClose = closeModal,
        showCloseButton = true,
        size = "normal",
        flushBody = false,
    } = $props<{
        children: Snippet;
        title?: string;
        onClose?: () => void;
        showCloseButton?: boolean;
        /**
         * Width tier. `normal` (600) suits a form; `settings` (820) fits a
         * two-pane layout; `wide` (1060) is for editors that need a canvas and
         * a preview side by side.
         */
        size?: "normal" | "settings" | "wide";

        /**
         * Drops the body's scroll padding and gap. Use when the modal's content
         * manages its own panes and needs to reach the modal's edges.
         */
        flushBody?: boolean;
    }>();

    let modalElement = $state<HTMLDivElement | null>(null);

    // Provided by ModalStackEntry. Modals underneath the topmost one stay
    // mounted, so each has to know whether it is the one the user is actually
    // looking at. A Modal rendered outside the stack gets no context and
    // treats itself as topmost.
    const topState = getContext<ModalTopState | undefined>(MODAL_IS_TOP);
    const isTop = $derived(topState?.current ?? true);

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
        // Every modal on the stack stays mounted and listens on `window`, so
        // without this guard a single Escape would fire every stacked modal's
        // handler at once.
        if (event.key === "Escape" && isTop) {
            onClose();
        }
    }

    onMount(() => {
        window.addEventListener("keydown", handleKeydown);
    });

    onDestroy(() => {
        window.removeEventListener("keydown", handleKeydown);
    });

    // Focus on mount, and again whenever this modal is uncovered, so that
    // going back moves keyboard focus with the user instead of stranding it
    // on the modal that just closed.
    $effect(() => {
        if (isTop) modalElement?.focus();
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
        class="modal-content size-{size}"
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
                        aria-label={$t("common.goBack")}
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
                    aria-label={$t("common.close")}
                >
                    <Icon type="close" />
                </button>
            {/if}
        </div>
        <div class="modal-body" class:flush={flushBody}>
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
        z-index: 9999;
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
    .modal-content.size-settings {
        max-width: 820px;
    }
    .modal-content.size-wide {
        max-width: 1060px;
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

    /* Content that lays out its own panes needs the full box: no outer scroll,
       no padding, no gap between it and the modal's edges. */
    .modal-body.flush {
        overflow: visible;
        max-height: none;
        gap: 0;
    }
    .modal-body.flush .modal-body-wrapper {
        padding: 0;
    }
</style>
