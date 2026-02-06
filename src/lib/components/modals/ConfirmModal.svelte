<script lang="ts">
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";

    let {
        title = "Are you sure?",
        message,
        onClose,
        onConfirm,
    } = $props<{
        title?: string;
        message: string;
        onClose: () => void;
        onConfirm: () => void;
    }>();
</script>

<Modal {title} {onClose}>
    <p>{message}</p>
    <div class="modal-actions">
        <Button variant="ghost" onclick={onClose}>Cancel</Button>
        <Button onclick={onConfirm}>Confirm</Button>
    </div>
</Modal>

<style>
    p {
        margin: 0;
        line-height: 1.6;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
    }
</style>
