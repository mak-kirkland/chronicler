<script lang="ts">
    import { getVersion } from "@tauri-apps/api/app";
    import { open } from "@tauri-apps/plugin-dialog";
    import {
        downloadPandoc,
        importDocxFiles,
        isPandocInstalled,
    } from "$lib/commands";
    import { world } from "$lib/worldStore";
    import { theme, setTheme, type Theme } from "$lib/settingsStore";
    import Button from "./Button.svelte";
    import ChangelogModal from "./ChangelogModal.svelte";
    import Modal from "./Modal.svelte";

    let { onClose = () => {}, onChangeVault = () => {} } = $props<{
        onClose?: () => void;
        onChangeVault?: () => void;
    }>();

    let pandocInstalled = $state(false);
    let isInstalling = $state(false);
    let importMessage = $state<string | null>(null);
    let appVersion = $state<string | null>(null);
    let showChangelog = $state(false);

    $effect(() => {
        // Check for pandoc
        isPandocInstalled()
            .then((installed) => {
                pandocInstalled = installed;
            })
            .catch((err) => {
                console.error("Failed to check pandoc status:", err);
                pandocInstalled = false;
            });

        // Get the application version
        getVersion()
            .then((version) => {
                appVersion = version;
            })
            .catch((err) => {
                console.error("Failed to get app version:", err);
            });
    });

    async function installPandoc() {
        if (
            !window.confirm(
                "This feature requires Pandoc, a universal document converter. Allow Chronicler to download it? (This is a one-time download of approx. 200MB).",
            )
        ) {
            return;
        }

        isInstalling = true;
        importMessage = "Downloading and setting up Pandoc...";
        try {
            await downloadPandoc();
            pandocInstalled = true;
            importMessage =
                "Pandoc installed successfully! You can now import files.";
        } catch (e) {
            console.error("Pandoc installation failed:", e);
            importMessage = `Failed to install Pandoc: ${e}`;
        } finally {
            isInstalling = false;
        }
    }

    async function importFiles() {
        if (!pandocInstalled) {
            await installPandoc();
            // If installation was successful, the user can click again to import.
            return;
        }

        try {
            const selected = await open({
                multiple: true,
                filters: [{ name: "Word Document", extensions: ["docx"] }],
            });

            if (Array.isArray(selected) && selected.length > 0) {
                const paths = selected;
                importMessage = `Importing ${paths.length} file(s)...`;
                await importDocxFiles(paths);

                // Manually trigger a refresh after import
                await world.initialize();

                alert(`${paths.length} file(s) imported successfully!`);
                onClose();
            }
        } catch (e) {
            console.error("File import failed:", e);
            alert(`File import failed: ${e}`);
        }
    }
</script>

<Modal title="Settings" {onClose}>
    <div class="modal-body-content">
        <div class="setting-item">
            <h4>Theme</h4>
            <p>Change the appearance of the application.</p>
            <select
                class="theme-select"
                value={$theme}
                onchange={(e) => setTheme(e.currentTarget.value as Theme)}
            >
                <option value="light">Parchment & Ink</option>
                <option value="dark">Slate & Chalk (Dark)</option>
                <option value="burgundy">Parchment & Wine</option>
                <option value="slate-and-gold">Slate & Gold (Dark)</option>
                <option value="hologram">Sci-Fi Hologram</option>
            </select>
        </div>

        <div class="setting-item">
            <h4>Change Vault</h4>
            <p>Change the root folder for your notes.</p>
            <Button onclick={onChangeVault}>Change Vault Folder</Button>
        </div>

        <div class="setting-item">
            <h4>Import</h4>
            <p>
                Import .docx files as new Markdown pages in your vault's root
                directory.
            </p>
            <Button onclick={importFiles} disabled={isInstalling}>
                {#if isInstalling}
                    Installing Pandoc...
                {:else if !pandocInstalled}
                    Install Pandoc & Import
                {:else}
                    Import from .docx
                {/if}
            </Button>
            {#if importMessage}
                <p class="import-message">{importMessage}</p>
            {/if}
        </div>
    </div>

    {#if appVersion}
        <div class="modal-footer">
            <p>Chronicler Version: {appVersion}</p>
            <button class="link-button" onclick={() => (showChangelog = true)}>
                View Changelog
            </button>
        </div>
    {/if}
</Modal>

{#if showChangelog}
    <ChangelogModal onClose={() => (showChangelog = false)} />
{/if}

<style>
    .modal-body-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
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
    h4 {
        margin: 0;
    }
    .setting-item p {
        margin: 0;
        color: var(--color-text-primary);
        font-size: 0.95rem;
    }
    .import-message {
        font-size: 0.9rem;
        font-style: italic;
        color: var(--color-text-secondary);
        margin-top: 0.5rem !important;
    }
    .modal-footer {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border-primary);
        text-align: center;
        font-size: 0.85rem;
        color: var(--color-text-secondary);
    }
    .modal-footer p {
        margin: 0;
    }
    .theme-select {
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        padding: 0.5rem;
        font-family: inherit;
        font-size: 1rem;
        width: 100%;
        cursor: pointer;
    }
    .link-button {
        background: none;
        border: none;
        padding: 0;
        margin-top: 0.25rem;
        color: var(--color-text-secondary);
        text-decoration: underline;
        cursor: pointer;
        font-size: 0.85rem;
    }
    .link-button:hover {
        color: var(--color-text-primary);
    }
</style>
