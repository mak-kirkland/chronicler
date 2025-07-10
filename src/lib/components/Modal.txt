<script lang="ts">
    import { onMount, onDestroy } from "svelte";

    let {
        children,
        title = "Modal Title",
        onClose = () => {},
    } = $props<{
        children: any;
        title?: string;
        onClose?: () => void;
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
            <button class="close-btn" onclick={onClose} aria-label="Close modal"
                >&times;</button
            >
        </div>
        <div class="modal-body">
            {@render children()}
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
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    .modal-content {
        background-image: url("/parchment.jpg");
        background-color: #fdf6e3;
        background-size: cover;
        padding: 2rem;
        border-radius: 8px;
        border: 2px solid var(--border-color);
        width: 100%;
        max-width: 500px;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        color: var(--ink);
    }
    .modal-content:focus {
        outline: 2px solid var(--accent-color);
    }
    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 1rem;
        margin-bottom: 1rem;
    }
    .modal-header h3 {
        font-family: "Uncial Antiqua", cursive;
        font-size: 1.5rem;
        color: var(--ink-light);
        margin: 0;
    }
    .close-btn {
        background: none;
        border: none;
        font-size: 2rem;
        color: var(--ink-light);
        cursor: pointer;
    }
    .modal-body {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
</style>
