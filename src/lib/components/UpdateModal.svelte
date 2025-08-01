<script lang="ts">
    import { onMount } from "svelte";
    import type { Update } from "@tauri-apps/plugin-updater";
    import { getVersion } from "@tauri-apps/api/app";
    import {
        installUpdate,
        openReleasePage,
        formatChangelog,
    } from "$lib/updater";
    import Modal from "$lib/components/Modal.svelte";
    import ErrorBox from "./ErrorBox.svelte";
    import Button from "./Button.svelte";

    let { update, manualUpdateRequired, onClose } = $props<{
        update: Update;
        manualUpdateRequired: boolean;
        onClose: () => void;
    }>();

    let isUpdating = $state(false);
    let installError = $state<string | null>(null);
    let currentVersion = $state<string | null>(null);

    // The formatted changelog is derived directly from the update's body property.
    const formattedChangelog = $derived(
        formatChangelog(update.body, currentVersion),
    );

    // Fetch the current app version when the component is mounted.
    onMount(async () => {
        try {
            currentVersion = await getVersion();
        } catch (e) {
            console.error("Failed to get app version:", e);
        }
    });

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
        {#if currentVersion}(you have {currentVersion}){/if}.
    </p>

    {#if formattedChangelog}
        <div class="release-notes">
            <div class="notes-content">{@html formattedChangelog}</div>
        </div>
    {/if}

    {#if manualUpdateRequired}
        <div class="manual-update-notice">
            <p><strong>Manual Update Required</strong></p>
            <p class="text-sm">
                Since you installed via a system package manager (.deb or .rpm),
                please download the latest version from our releases page.
            </p>
        </div>
        <div class="button-group">
            <Button onclick={onClose}>Later</Button>
            <Button onclick={openReleasePage}>Go to Downloads</Button>
        </div>
    {:else}
        {#if installError}
            <ErrorBox title="Update Failed">{installError}</ErrorBox>
        {/if}
        <div class="button-group">
            <Button
                class="button-secondary"
                onclick={onClose}
                disabled={isUpdating}>Later</Button
            >
            <Button
                class="button-primary"
                onclick={handleInstallClick}
                disabled={isUpdating}
            >
                {#if isUpdating}
                    <span>Updating...</span>
                {:else}
                    <span>Install & Relaunch</span>
                {/if}
            </Button>
        </div>
    {/if}
</Modal>

<style>
    .release-notes {
        padding: 1rem;
        background-color: var(--color-background-secondary);
        border-radius: 6px;
        max-height: 250px;
        /* Enable both vertical and horizontal scrolling */
        overflow: auto;
        border: 1px solid var(--color-border-primary);
    }
    .notes-content {
        font-size: 0.8rem;
        line-height: 1.7;
        white-space: pre;
        font-family: monospace;
    }
    .manual-update-notice {
        background-color: var(--color-background-tertiary);
        border: 1px solid var(--color-background-tertiary);
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
