<script lang="ts">
    import { onMount } from "svelte";
    import type { Update } from "@tauri-apps/plugin-updater";
    import { getVersion } from "@tauri-apps/api/app";
    import {
        installUpdate,
        openReleasePage,
        formatChangelog,
    } from "$lib/updater";
    import { renderMarkdown } from "$lib/commands";
    import type { RenderedPage } from "$lib/bindings";
    import Modal from "$lib/components/Modal.svelte";
    import ErrorBox from "./ErrorBox.svelte";
    import Button from "./Button.svelte";
    import Preview from "./Preview.svelte";

    let { update, manualUpdateRequired, onClose } = $props<{
        update: Update;
        manualUpdateRequired: boolean;
        onClose: () => void;
    }>();

    let isUpdating = $state(false);
    let installError = $state<string | null>(null);
    let currentVersion = $state<string | null>(null);
    let renderedChangelog = $state<RenderedPage | null>(null);

    // Fetch the current app version and render the changelog when the component is mounted.
    onMount(async () => {
        try {
            const version = await getVersion();
            currentVersion = version;

            const markdownContent = formatChangelog(update.body, version);
            if (markdownContent) {
                renderedChangelog = await renderMarkdown(markdownContent);
            }
        } catch (e) {
            console.error("Failed to get app version or render changelog:", e);
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

    {#if renderedChangelog}
        <div class="release-notes">
            <Preview renderedData={renderedChangelog} />
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

    .release-notes :global(.main-content) {
        font-size: 0.9rem;
        line-height: 1.7;
        /* Remove default padding/margin for the changelog view */
        padding-left: 0;
        margin-left: 0;
    }

    .release-notes :global(ul) {
        padding-left: 1.25rem; /* Adjust if needed to align bullet points */
        margin-left: 0;
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
