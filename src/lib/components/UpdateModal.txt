<script lang="ts">
    import type { Update } from "@tauri-apps/plugin-updater";
    import { installUpdate, openReleasePage } from "$lib/updater";
    import Modal from "$lib/components/Modal.svelte";

    let {
        update,
        manualUpdateRequired,
        onClose,
    }: {
        update: Update;
        manualUpdateRequired: boolean;
        onClose: () => void;
    } = $props();

    let isUpdating = $state(false);
    let installError = $state<string | null>(null);

    async function handleInstallClick() {
        isUpdating = true;
        installError = null;
        try {
            await installUpdate(update);
            // On success, the app will relaunch, so no need to set isUpdating = false.
        } catch (error) {
            console.error("Failed to install update:", error);
            installError =
                "Update failed. Please try again or visit the downloads page to update manually.";
            isUpdating = false; // Only reset on error
        }
    }
</script>

<Modal title="Update Available!" {onClose}>
    <p>
        A new version of Chronicler is available: <strong
            >{update.version}</strong
        >
    </p>

    {#if manualUpdateRequired}
        <div class="manual-update-notice">
            <p><strong>Manual Update Required</strong></p>
            <p class="text-sm">
                Since you installed via a system package manager (.deb or .rpm),
                please download the latest version from our releases page.
            </p>
        </div>
        <div class="button-group">
            <button class="button-secondary" onclick={onClose}>Later</button>
            <button class="button-primary" onclick={openReleasePage}
                >Go to Downloads</button
            >
        </div>
    {:else}
        {#if installError}
            <div class="manual-update-notice">
                <p><strong>Update Failed</strong></p>
                <p class="text-sm">{installError}</p>
            </div>
        {/if}
        <div class="button-group">
            <button
                class="button-secondary"
                onclick={onClose}
                disabled={isUpdating}>Later</button
            >
            <button
                class="button-primary"
                onclick={handleInstallClick}
                disabled={isUpdating}
            >
                {#if isUpdating}
                    <span>Updating...</span>
                {:else}
                    <span>Install & Relaunch</span>
                {/if}
            </button>
        </div>
    {/if}
</Modal>

<style>
    .manual-update-notice {
        background-color: rgba(118, 72, 9, 0.1);
        border: 1px solid rgba(118, 72, 9, 0.2);
        padding: 1rem;
        border-radius: 6px;
        margin-top: 1rem;
        margin-bottom: 1rem;
    }
    .manual-update-notice .text-sm {
        font-size: 0.9rem;
        opacity: 0.9;
    }
    .button-group {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        margin-top: 1.5rem;
    }
</style>
