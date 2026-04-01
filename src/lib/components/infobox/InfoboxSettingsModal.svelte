<script lang="ts">
    import {
        areInfoboxTagsVisible,
        areFooterTagsVisible,
    } from "$lib/settingsStore";
    import Modal from "$lib/components/modals/Modal.svelte";
    import ToggleSwitch from "$lib/components/ui/ToggleSwitch.svelte";

    let { onClose } = $props<{ onClose: () => void }>();
</script>

<Modal title="Infobox Settings" {onClose}>
    <div class="modal-body-content">
        <ToggleSwitch
            id="show-tags"
            label="Show Tags in Infobox"
            bind:checked={$areInfoboxTagsVisible}
        />
        <ToggleSwitch
            id="show-footer-tags"
            label="Show Tags in Footer"
            bind:checked={$areFooterTagsVisible}
        />
    </div>
</Modal>

<style>
    .modal-body-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 300px;
    }
</style>
