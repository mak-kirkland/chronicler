<script lang="ts">
    import { getVersion } from "@tauri-apps/api/app";
    import { open } from "@tauri-apps/plugin-dialog";
    import {
        downloadPandoc,
        importDocxFiles,
        isPandocInstalled,
    } from "$lib/commands";
    import { world } from "$lib/worldStore";
    import { selectNewVault } from "$lib/startup";
    import {
        activeTheme,
        setActiveTheme,
        fontSize,
        setFontSize,
        userThemes,
        type ThemeName,
    } from "$lib/settingsStore";
    import { openModal, closeModal } from "$lib/modalStore";
    import { licenseStore } from "$lib/licenseStore";
    import Button from "./Button.svelte";
    import ChangelogModal from "./ChangelogModal.svelte";
    import Modal from "./Modal.svelte";
    import ThemeEditorModal from "./ThemeEditorModal.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";

    let { onClose = () => {} } = $props<{
        onClose?: () => void;
    }>();

    // Pandoc State
    let pandocInstalled = $state(false);
    let isInstalling = $state(false);
    let importMessage = $state<string | null>(null);

    // License State
    let licenseMessage = $state<string | null>(null);
    let isVerifyingLicense = $state(false);
    let licenseKeyInput = $state("");
    let showLicenseInput = $state(false);

    // App Info State
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

    /**
     * This function handles the logic for changing the vault.
     * It closes the current settings modal and then calls the global
     * function to reset the application state.
     */
    function handleChangeVault() {
        onClose();
        selectNewVault();
    }

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

    /**
     * Verifies a license key pasted by the user.
     */
    async function verifyLicense() {
        if (!licenseKeyInput.trim()) {
            licenseMessage = "Please paste a license key.";
            return;
        }

        licenseMessage = null;
        isVerifyingLicense = true;
        try {
            const success = await licenseStore.verify(licenseKeyInput);

            if (success) {
                licenseMessage = "License verified successfully!";
                licenseKeyInput = ""; // Clear input on success
                showLicenseInput = false; // Hide input on success
            } else {
                licenseMessage = `License is invalid. Please check the key and try again.`;
            }
        } catch (e: any) {
            console.error("License verification failed:", e);
            licenseMessage = `Failed to verify license: ${e.message || e}`;
        } finally {
            isVerifyingLicense = false;
        }
    }

    function openThemeEditor() {
        openModal({
            component: ThemeEditorModal,
            props: {
                onClose: closeModal,
            },
        });
    }
</script>

<Modal title="Settings" {onClose}>
    <div class="modal-body-content">
        <div class="setting-item">
            <h4>Theme</h4>
            <p>Change the appearance of the application.</p>
            <div class="theme-controls">
                <select
                    class="theme-select"
                    value={$activeTheme}
                    onchange={(e) =>
                        setActiveTheme(e.currentTarget.value as ThemeName)}
                >
                    <optgroup label="Built-in Themes">
                        <option value="light">Parchment & Ink</option>
                        <option value="burgundy">Parchment & Wine</option>
                        <option value="dark">Slate & Chalk (Dark)</option>
                        <option value="slate-and-gold"
                            >Slate & Gold (Dark)</option
                        >
                        <option value="hologram">Sci-Fi Hologram</option>
                        <option value="professional">Professional</option>
                    </optgroup>
                    {#if $userThemes.length > 0}
                        <optgroup label="Your Themes">
                            {#each $userThemes as theme (theme.name)}
                                <option value={theme.name}>{theme.name}</option>
                            {/each}
                        </optgroup>
                    {/if}
                </select>
                <Button onclick={openThemeEditor}>Manage Themes</Button>
            </div>
        </div>

        <div class="setting-item">
            <h4>Font Size</h4>
            <p>Adjust the application's base font size.</p>
            <div class="font-slider-container">
                <input
                    type="range"
                    min="80"
                    max="140"
                    step="5"
                    value={$fontSize}
                    oninput={(e) =>
                        setFontSize(parseInt(e.currentTarget.value))}
                />
                <span class="font-size-label">{$fontSize}%</span>
            </div>
        </div>

        <div class="setting-item">
            <h4>Change Vault</h4>
            <p>Change the root folder for your notes.</p>
            <Button onclick={handleChangeVault}>Change Vault Folder</Button>
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

        <div class="setting-item">
            <h4>License</h4>
            {#if $licenseStore.status === "licensed"}
                <p>
                    License Status:
                    <span class="license-status-active"
                        >{$licenseStore.license?.status}</span
                    >
                </p>
                <p class="license-expiry">
                    Expiry: {$licenseStore.license?.expiry}
                </p>
                {#if !showLicenseInput}
                    <Button onclick={() => (showLicenseInput = true)}
                        >Replace License</Button
                    >
                {/if}
            {:else}
                <p>
                    To keep Chronicler alive, please consider purchasing a
                    <a
                        href="https://chronicler.pro/#support"
                        onclick={(event) => {
                            event.preventDefault();
                            openUrl("https://chronicler.pro/#support");
                        }}>Community License</a
                    >.
                </p>
            {/if}

            {#if $licenseStore.status !== "licensed" || showLicenseInput}
                <div class="license-input-group">
                    <input
                        type="text"
                        placeholder="Paste license key here"
                        bind:value={licenseKeyInput}
                        disabled={isVerifyingLicense}
                    />
                    <Button
                        onclick={verifyLicense}
                        disabled={isVerifyingLicense || !licenseKeyInput}
                    >
                        {#if isVerifyingLicense}
                            Verifying...
                        {:else}
                            Verify License
                        {/if}
                    </Button>
                </div>
            {/if}

            {#if licenseMessage}
                <p class="import-message">{licenseMessage}</p>
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
    .license-expiry {
        font-size: 0.85rem !important;
        color: var(--color-text-secondary) !important;
        margin-top: -0.25rem !important;
    }
    .license-status-active {
        font-weight: bold;
        color: var(--color-accent-primary);
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
    .theme-controls {
        display: flex;
        gap: 0.5rem;
    }
    .theme-select {
        flex-grow: 1;
        appearance: none;
        background-image: var(--select-arrow);
        background-repeat: no-repeat;
        background-position: right 0.75rem center;
        background-size: 1.2em;
        padding-right: 2.5rem;
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
    .font-slider-container {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .font-slider-container input[type="range"] {
        flex-grow: 1;
    }
    .font-size-label {
        font-weight: bold;
        color: var(--color-text-secondary);
        min-width: 4ch;
        text-align: right;
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
    .license-input-group {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }

    .license-input-group input {
        flex-grow: 1;
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        padding: 0.5rem 0.75rem;
        font-family: inherit;
        font-size: 1rem;
    }

    .license-input-group input:focus {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: -1px;
        border-color: var(--color-accent-primary);
    }
</style>
