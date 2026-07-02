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
    import Modal from "$lib/components/modals/Modal.svelte";
    import ErrorBox from "$lib/components/ui/ErrorBox.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Preview from "$lib/components/views/Preview.svelte";
    import { log } from "$lib/logger";
    import { t } from "$lib/i18n";

    let { update, installType, onClose } = $props<{
        update: Update;
        // null on macOS/Windows; "appimage" | "flatpak" | "other" on Linux.
        installType: string | null;
        onClose: () => void;
    }>();

    // Flatpak and system-package installs (.deb/.rpm/AUR) must update via
    // their respective package managers — the in-app updater would either
    // fail (Flatpak's /app is read-only) or step on the system package
    // database (.deb/.rpm).
    const manualUpdateRequired = $derived(
        installType === "other" || installType === "flatpak",
    );

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
            log.error(
                "Failed to get app version or render changelog",
                e,
                "UpdateModal",
            );
        }
    });

    async function handleInstallClick() {
        isUpdating = true;
        installError = null;
        try {
            await installUpdate(update);
            // On success, the app will relaunch, so no need to set isUpdating = false.
        } catch (error) {
            log.error("Failed to install update", error, "UpdateModal");
            installError = $t("update.failedBody");
            isUpdating = false; // Only reset on error
        }
    }
</script>

<Modal title={$t("update.title")} {onClose}>
    <p>
        {$t("update.available")}
        <strong>{update.version}</strong>
        {#if currentVersion}{$t("update.youHave", {
                version: currentVersion,
            })}{/if}.
    </p>

    {#if renderedChangelog}
        <div class="release-notes">
            <Preview renderedData={renderedChangelog} />
        </div>
    {/if}

    {#if manualUpdateRequired}
        <div class="manual-update-notice">
            <p><strong>{$t("update.manualRequired")}</strong></p>
            {#if installType === "flatpak"}
                <p class="text-sm">
                    {$t("update.flatpakBody")}
                </p>
                <pre class="update-command"><code
                        >flatpak update pro.chronicler.Chronicler</code
                    ></pre>
                <p class="text-sm">
                    {$t("update.flatpakSoftwareCenter")}
                </p>
            {:else}
                <p class="text-sm">
                    {$t("update.packageManagerBody")}
                </p>
            {/if}
        </div>
        <div class="button-group">
            <Button onclick={onClose}>{$t("update.later")}</Button>
            {#if installType !== "flatpak"}
                <Button onclick={openReleasePage}
                    >{$t("update.goToDownloads")}</Button
                >
            {/if}
        </div>
    {:else}
        {#if installError}
            <ErrorBox title={$t("update.failedTitle")}>{installError}</ErrorBox>
        {/if}
        <div class="button-group">
            <Button
                class="button-secondary"
                onclick={onClose}
                disabled={isUpdating}>{$t("update.later")}</Button
            >
            <Button
                class="button-primary"
                onclick={handleInstallClick}
                disabled={isUpdating}
            >
                {#if isUpdating}
                    <span>{$t("update.updating")}</span>
                {:else}
                    <span>{$t("update.install")}</span>
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
    .update-command {
        background-color: var(--color-background-primary);
        border: 1px solid var(--color-border-primary);
        border-radius: 4px;
        padding: 0.5rem 0.75rem;
        margin: 0.5rem 0;
        font-family: monospace;
        font-size: 0.85rem;
        overflow-x: auto;
        user-select: text;
    }
    .button-group {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        margin-top: 1.5rem;
    }
</style>
