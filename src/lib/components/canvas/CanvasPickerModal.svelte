<script lang="ts">
    import Modal from "$lib/components/modals/Modal.svelte";
    import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
    import Button from "$lib/components/ui/Button.svelte";

    let { title, options, onSelect, onClose } = $props<{
        title: string;
        options: string[];
        onSelect: (value: string) => void;
        onClose: () => void;
    }>();

    let value = $state("");
</script>

<Modal {title} {onClose}>
    <div class="picker">
        <SearchableSelect {options} bind:value placeholder="Search…" />
        <div class="actions">
            <Button type="button" variant="ghost" onclick={onClose}>Cancel</Button>
            <Button
                type="button"
                disabled={!value}
                onclick={() => {
                    onSelect(value);
                    onClose();
                }}>Add</Button
            >
        </div>
    </div>
</Modal>

<style>
    .picker {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
    }
</style>
