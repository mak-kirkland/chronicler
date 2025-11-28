<script lang="ts">
    import {
        areInfoboxTagsVisible,
        areFooterTagsVisible,
    } from "$lib/settingsStore";
    import Modal from "./Modal.svelte";

    let { onClose } = $props<{ onClose: () => void }>();
</script>

<Modal title="Infobox Settings" {onClose}>
    <div class="modal-body-content">
        <div class="setting-item">
            <div class="setting-control-row">
                <label for="show-tags">Show Tags in Infobox</label>
                <label class="toggle-switch">
                    <input
                        type="checkbox"
                        id="show-tags"
                        bind:checked={$areInfoboxTagsVisible}
                    />
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <div class="setting-item">
            <div class="setting-control-row">
                <label for="show-footer-tags">Show Tags in Footer</label>
                <label class="toggle-switch">
                    <input
                        type="checkbox"
                        id="show-footer-tags"
                        bind:checked={$areFooterTagsVisible}
                    />
                    <span class="slider"></span>
                </label>
            </div>
        </div>
    </div>
</Modal>

<style>
    /* Styles borrowed from SettingsModal.svelte for consistency */
    .modal-body-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 300px;
    }
    .setting-item {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .setting-item:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }

    .setting-control-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .setting-control-row label {
        font-weight: 600;
        color: var(--color-text-primary);
    }

    /* --- Toggle Switch Styles --- */
    .toggle-switch {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
    }

    .toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--color-background-tertiary);
        transition: 0.2s;
        border-radius: 24px;
        border: 1px solid var(--color-border-primary);
    }

    .slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 2px;
        background-color: white;
        transition: 0.2s;
        border-radius: 50%;
    }

    input:checked + .slider {
        background-color: var(--color-accent-primary);
        border-color: var(--color-accent-primary);
    }

    input:focus-visible + .slider {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 2px;
    }

    input:checked + .slider:before {
        transform: translateX(19px);
    }
</style>
