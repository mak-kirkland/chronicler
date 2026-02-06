<script lang="ts">
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { autofocus } from "$lib/domActions";

    let {
        title,
        label,
        initialValue = "",
        buttonText = "Submit",
        onClose,
        onSubmit,
    } = $props<{
        title: string;
        label: string;
        initialValue?: string;
        buttonText?: string;
        onClose: () => void;
        onSubmit: (value: string) => void;
    }>();

    let value = $state(initialValue);

    function handleSubmit(event: SubmitEvent) {
        event.preventDefault();
        if (value.trim()) {
            onSubmit(value.trim());
        }
    }
</script>

<Modal {title} {onClose}>
    <form onsubmit={handleSubmit} class="form">
        <label for="text-input">{label}</label>
        <input
            id="text-input"
            type="text"
            bind:value
            use:autofocus
            class="text-input"
        />
        <div class="modal-actions">
            <Button type="submit">{buttonText}</Button>
        </div>
    </form>
</Modal>

<style>
    .form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    label {
        font-weight: bold;
        color: var(--color-text-secondary);
    }
    .text-input {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 1rem;
        box-sizing: border-box;
    }
    .text-input:focus {
        outline: 1px solid var(--color-accent-primary);
        border-color: var(--color-accent-primary);
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
    }
</style>
