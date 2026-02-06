<script lang="ts">
    import { getVersion } from "@tauri-apps/api/app";
    import { selectNewVault } from "$lib/startup";
    import { onMount } from "svelte";
    import {
        activeTheme,
        setActiveTheme,
        fontSize,
        setFontSize,
        userThemes,
        type ThemeName,
        headingFont,
        bodyFont,
        userFonts,
    } from "$lib/settingsStore";
    import { AVAILABLE_FONTS } from "$lib/themeRegistry";
    import { loadAllUserFonts } from "$lib/fonts";
    import { openModal, closeModal } from "$lib/modalStore";
    import { licenseStore } from "$lib/licenseStore";
    import Button from "./Button.svelte";
    import ChangelogModal from "./ChangelogModal.svelte";
    import Modal from "./Modal.svelte";
    import ThemeEditorModal from "./ThemeEditorModal.svelte";
    import TemplateManagerModal from "./TemplateManagerModal.svelte";
    import AtmosphereModal from "./AtmosphereModal.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import ImporterModal from "./ImporterModal.svelte";
    import { openLogDirectory } from "$lib/commands";
    import { DONATE_URL } from "$lib/config";

    let { onClose = () => {} } = $props<{
        onClose?: () => void;
    }>();

    // License State
    let licenseMessage = $state<string | null>(null);
    let isVerifyingLicense = $state(false);
    let licenseKeyInput = $state("");
    let showLicenseInput = $state(false);

    // App Info State
    let appVersion = $state<string | null>(null);
    let showChangelog = $state(false);

    // This effect lazily-loads the full font list.
    onMount(() => {
        loadAllUserFonts();
    });

    /** A reactive list that combines the built-in fonts with the loaded user fonts.
     */
    const allAvailableFonts = $derived([
        ...AVAILABLE_FONTS,
        ...$userFonts.map((f) => ({ name: f.name, value: `"${f.name}"` })),
    ]);

    $effect(() => {
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

    function openTemplateManager() {
        openModal({
            component: TemplateManagerModal,
            props: {
                onClose: closeModal,
            },
        });
    }

    function openAtmosphereManager() {
        openModal({
            component: AtmosphereModal,
            props: {
                onClose: closeModal,
            },
        });
    }

    /**
     * Opens the dedicated modal for handling file and folder imports.
     */
    function openImporter() {
        openModal({
            component: ImporterModal,
            props: {
                // Pass the `closeModal` function so the Importer can close itself
                // without affecting this Settings modal.
                onClose: closeModal,
            },
        });
    }
</script>

<Modal title="Settings" {onClose}>
    <div class="modal-body-content">
        <div class="setting-item">
            <h4>Appearance</h4>
            <p>Change the colors, fonts, and text size of the application.</p>
            <div class="appearance-controls">
                <!-- Theme (Color Palette) Selector -->
                <div class="form-group">
                    <label for="theme-select">Theme</label>
                    <div class="theme-controls">
                        <select
                            id="theme-select"
                            class="dropdown-select"
                            value={$activeTheme}
                            onchange={(e) =>
                                setActiveTheme(
                                    e.currentTarget.value as ThemeName,
                                )}
                        >
                            <optgroup label="Built-in Themes">
                                <option value="light">Parchment & Ink</option>
                                <option value="burgundy"
                                    >Parchment & Wine</option
                                >
                                <option value="dark"
                                    >Slate & Chalk (Dark)</option
                                >
                                <option value="slate-and-gold">
                                    Slate & Gold (Dark)
                                </option>
                                <option value="hologram">Sci-Fi Hologram</option
                                >
                                <option value="professional"
                                    >Professional</option
                                >
                                <option value="paneidos"
                                    >Paneidos (by Mar Qaroll)</option
                                >
                            </optgroup>
                            {#if $userThemes.length > 0}
                                <optgroup label="Your Themes">
                                    {#each $userThemes as theme (theme.name)}
                                        <option value={theme.name}>
                                            {theme.name}
                                        </option>
                                    {/each}
                                </optgroup>
                            {/if}
                        </select>
                        <Button onclick={openThemeEditor}>Manage Themes</Button>
                    </div>
                </div>

                <!-- World Atmosphere -->
                <div class="form-group">
                    <span>World Atmosphere</span>
                    <p class="setting-description">
                        Customize icons, textures, borders, and more.
                    </p>
                    <Button onclick={openAtmosphereManager}
                        >Customize Atmosphere</Button
                    >
                </div>

                <!-- Font Selectors -->
                <div class="font-selectors-grid">
                    <div class="form-group">
                        <label for="heading-font-select">Heading Font</label>
                        <select
                            id="heading-font-select"
                            class="dropdown-select"
                            bind:value={$headingFont}
                        >
                            {#each allAvailableFonts as font (font.value)}
                                <option value={font.value}>{font.name}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="body-font-select">Body Font</label>
                        <select
                            id="body-font-select"
                            class="dropdown-select"
                            bind:value={$bodyFont}
                        >
                            {#each allAvailableFonts as font (font.value)}
                                <option value={font.value}>{font.name}</option>
                            {/each}
                        </select>
                    </div>
                </div>

                <!-- Font Size Slider -->
                <div class="form-group">
                    <label for="font-size-slider">Font Size</label>
                    <div class="font-slider-container">
                        <input
                            id="font-size-slider"
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
            </div>
        </div>

        <div class="setting-item">
            <h4>Templates</h4>
            <p>Manage your custom page templates.</p>
            <Button onclick={openTemplateManager}>Manage Templates</Button>
        </div>

        <div class="setting-item">
            <h4>Change Vault</h4>
            <p>Change the root folder for your notes.</p>
            <Button onclick={handleChangeVault}>Change Vault Folder</Button>
        </div>

        <div class="setting-item">
            <h4>Import</h4>
            <p>Import .docx files from individual files or an entire folder.</p>
            <Button onclick={openImporter}>Open Importer</Button>
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
                    To keep Chronicler alive and disable the donation prompts,
                    please consider
                    <a
                        href="https://chronicler.pro/#support"
                        onclick={(event) => {
                            event.preventDefault();
                            openUrl(DONATE_URL);
                        }}>supporting</a
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
            <div class="footer-links">
                <button
                    class="link-button"
                    onclick={() => (showChangelog = true)}
                    >View Changelog</button
                >
                <span class="separator"> • </span>
                <button class="link-button" onclick={openLogDirectory}
                    >Open Log Directory</button
                >
            </div>
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
    /* Add specific style for the setting description to reduce margin */
    .setting-description {
        margin-bottom: 0.5rem !important;
        font-size: 0.9rem !important;
        color: var(--color-text-secondary) !important;
    }
    .appearance-controls {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-top: 0.5rem;
    }
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
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
        margin-bottom: 0.25rem;
    }
    .footer-links {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.5rem;
    }
    .theme-controls {
        display: flex;
        gap: 0.5rem;
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
    .font-selectors-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }
</style>
