<script lang="ts">
    import {
        areInfoboxTagsVisible,
        areFooterTagsVisible,
    } from "$lib/settingsStore";
    import Modal from "$lib/components/modals/Modal.svelte";
    import ToggleSwitch from "$lib/components/ui/ToggleSwitch.svelte";
    import { t } from "$lib/i18n";

    let { onClose } = $props<{ onClose: () => void }>();
</script>

<Modal title={$t("infobox.settingsTitle")} {onClose}>
    <div class="modal-body-content">
        <ToggleSwitch
            id="show-tags"
            label={$t("infobox.showTagsInInfobox")}
            bind:checked={$areInfoboxTagsVisible}
        />
        <ToggleSwitch
            id="show-footer-tags"
            label={$t("infobox.showTagsInFooter")}
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
