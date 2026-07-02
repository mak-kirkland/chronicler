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
        imageImportLocation,
        imageImportDir,
        promptForImageName,
        type ImageImportLocation,
    } from "$lib/settingsStore";
    import { AVAILABLE_FONTS } from "$lib/themeRegistry";
    import { loadAllUserFonts } from "$lib/fonts";
    import { open } from "@tauri-apps/plugin-dialog";
    import { installUserFont } from "$lib/commands";
    import { openModal, closeModal } from "$lib/modalStore";
    import { licenseStore } from "$lib/licenseStore";
    import Button from "$lib/components/ui/Button.svelte";
    import Select from "$lib/components/ui/Select.svelte";
    import ToggleSwitch from "$lib/components/ui/ToggleSwitch.svelte";
    import ChangelogModal from "$lib/components/modals/ChangelogModal.svelte";
    import Modal from "$lib/components/modals/Modal.svelte";
    import ThemeEditorModal from "$lib/components/modals/ThemeEditorModal.svelte";
    import TemplateManagerModal from "$lib/components/modals/TemplateManagerModal.svelte";
    import KeybindingsModal from "$lib/components/modals/KeybindingsModal.svelte";
    import AtmosphereModal from "$lib/components/modals/AtmosphereModal.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import ImporterModal from "$lib/components/modals/ImporterModal.svelte";
    import CssSnippetsModal from "$lib/components/modals/CssSnippetsModal.svelte";
    import {
        openLogDirectory,
        getTelemetryEnabled,
        setTelemetryEnabled,
    } from "$lib/commands";
    import { DONATE_URL } from "$lib/config";
    import { log } from "$lib/logger";
    import {
        t,
        availableLocales,
        languagePreference,
        setLanguagePreference,
        systemLocaleCode,
        SYSTEM_LOCALE,
    } from "$lib/i18n";

    let { onClose = () => {} } = $props<{
        onClose?: () => void;
    }>();

    /** Endonym of the language the OS locale resolves to, e.g. "Polski". */
    const systemLocaleName = $derived(
        $availableLocales.find((l) => l.code === systemLocaleCode())?.name ??
            "English",
    );

    // License State
    let licenseMessage = $state<string | null>(null);
    let isVerifyingLicense = $state(false);
    let licenseKeyInput = $state("");
    let showLicenseInput = $state(false);

    // App Info State
    let appVersion = $state<string | null>(null);
    let showChangelog = $state(false);

    // "Add Font…" status
    let isInstallingFont = $state(false);
    let fontInstallMessage = $state<string | null>(null);

    // Telemetry toggle state. `telemetryLoaded` guards the auto-save effect
    // so the default `false` doesn't overwrite the real value during mount.
    let telemetryEnabled = $state(false);
    let telemetryLoaded = $state(false);

    onMount(() => {
        loadAllUserFonts();
    });

    onMount(async () => {
        try {
            const value = await getTelemetryEnabled();
            telemetryEnabled = value === true;
        } catch (e) {
            log.error("Failed to load telemetry setting", e, "SettingsModal");
        } finally {
            telemetryLoaded = true;
        }
    });

    // Persist whenever the toggle changes (but not during initial load).
    $effect(() => {
        if (!telemetryLoaded) return;
        const currentValue = telemetryEnabled;
        setTelemetryEnabled(currentValue).catch((e) => {
            log.error(
                "Failed to save telemetry preference",
                e,
                "SettingsModal",
            );
        });
    });

    /** A reactive list that combines the built-in fonts with the loaded user fonts. */
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
                log.error("Failed to get app version", err, "SettingsModal");
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
            licenseMessage = $t("settings.license.emptyKey");
            return;
        }

        licenseMessage = null;
        isVerifyingLicense = true;
        try {
            const success = await licenseStore.verify(licenseKeyInput);

            if (success) {
                licenseMessage = $t("settings.license.verified");
                licenseKeyInput = ""; // Clear input on success
                showLicenseInput = false; // Hide input on success
            } else {
                licenseMessage = $t("settings.license.invalid");
            }
        } catch (e: any) {
            log.error("License verification failed", e, "SettingsModal");
            licenseMessage = $t("settings.license.verifyFailed", {
                error: e.message || e,
            });
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

    function openKeybindings() {
        openModal({
            component: KeybindingsModal,
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

    function openSnippetsManager() {
        openModal({
            component: CssSnippetsModal,
            props: {
                onClose: closeModal,
            },
        });
    }

    /**
     * Opens an OS file picker, copies the selected font file(s) into the
     * managed fonts directory, and refreshes the dropdown.
     */
    async function handleAddFont() {
        if (isInstallingFont) return;
        try {
            const selected = await open({
                multiple: true,
                filters: [
                    {
                        name: "Font",
                        extensions: ["ttf", "otf", "woff2"],
                    },
                ],
            });
            if (!selected) return;
            const paths = Array.isArray(selected) ? selected : [selected];
            if (paths.length === 0) return;

            isInstallingFont = true;
            fontInstallMessage = null;

            const failures: string[] = [];
            for (const path of paths) {
                try {
                    await installUserFont(path);
                } catch (e) {
                    log.error(
                        `Failed to install font '${path}'`,
                        e,
                        "SettingsModal",
                    );
                    failures.push(path);
                }
            }

            await loadAllUserFonts(true);

            const installed = paths.length - failures.length;
            if (failures.length === 0) {
                fontInstallMessage = $t("settings.fonts.added", {
                    count: installed,
                });
            } else {
                fontInstallMessage = $t("settings.fonts.addedPartial", {
                    installed,
                    total: paths.length,
                    failed: failures.length,
                });
            }
        } catch (e) {
            log.error("Add font failed", e, "SettingsModal");
            fontInstallMessage = $t("settings.fonts.addFailed");
        } finally {
            isInstallingFont = false;
        }
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

<Modal title={$t("settings.title")} {onClose}>
    <div class="modal-body-content">
        <div class="setting-item">
            <h4>{$t("settings.language.title")}</h4>
            <p>{$t("settings.language.description")}</p>
            <div class="form-group">
                <Select
                    options={[
                        {
                            value: SYSTEM_LOCALE,
                            label: $t("settings.language.system", {
                                name: systemLocaleName,
                            }),
                        },
                        ...$availableLocales.map((l) => ({
                            value: l.code,
                            label: l.name,
                        })),
                    ]}
                    value={$languagePreference}
                    onSelect={(val) => setLanguagePreference(val)}
                />
            </div>
        </div>

        <div class="setting-item">
            <h4>{$t("settings.appearance.title")}</h4>
            <p>{$t("settings.appearance.description")}</p>
            <div class="appearance-controls">
                <!-- Theme (Color Palette) Selector -->
                <div class="form-group">
                    <!-- svelte-ignore a11y_label_has_associated_control -->
                    <label>{$t("settings.appearance.theme")}</label>
                    <div class="theme-controls">
                        <Select
                            groups={[
                                {
                                    label: $t(
                                        "settings.appearance.builtInThemes",
                                    ),
                                    options: [
                                        {
                                            value: "light",
                                            label: "Parchment & Ink",
                                        },
                                        {
                                            value: "burgundy",
                                            label: "Parchment & Wine",
                                        },
                                        {
                                            value: "dark",
                                            label: "Slate & Chalk (Dark)",
                                        },
                                        {
                                            value: "slate-and-gold",
                                            label: "Slate & Gold (Dark)",
                                        },
                                        {
                                            value: "hologram",
                                            label: "Sci-Fi Hologram",
                                        },
                                        {
                                            value: "professional",
                                            label: "Professional",
                                        },
                                        {
                                            value: "paneidos",
                                            label: "Paneidos",
                                        },
                                    ],
                                },
                                ...($userThemes.length > 0
                                    ? [
                                          {
                                              label: $t(
                                                  "settings.appearance.yourThemes",
                                              ),
                                              options: $userThemes.map(
                                                  (theme) => ({
                                                      value: theme.name,
                                                      label: theme.name,
                                                  }),
                                              ),
                                          },
                                      ]
                                    : []),
                            ]}
                            value={$activeTheme}
                            onSelect={(val) => setActiveTheme(val as ThemeName)}
                        />
                        <Button onclick={openThemeEditor}
                            >{$t("settings.appearance.manageThemes")}</Button
                        >
                    </div>
                </div>

                <!-- World Atmosphere -->
                <div class="form-group">
                    <span>{$t("settings.atmosphere.title")}</span>
                    <p class="setting-description">
                        {$t("settings.atmosphere.description")}
                    </p>
                    <Button onclick={openAtmosphereManager}
                        >{$t("settings.atmosphere.customize")}</Button
                    >
                </div>

                <!-- Font Selectors -->
                <div class="font-selectors-grid">
                    <div class="form-group">
                        <!-- svelte-ignore a11y_label_has_associated_control -->
                        <label>{$t("settings.fonts.heading")}</label>
                        <Select
                            options={allAvailableFonts.map((f) => ({
                                value: f.value,
                                label: f.name,
                            }))}
                            bind:value={$headingFont}
                        />
                    </div>
                    <div class="form-group">
                        <!-- svelte-ignore a11y_label_has_associated_control -->
                        <label>{$t("settings.fonts.body")}</label>
                        <Select
                            options={allAvailableFonts.map((f) => ({
                                value: f.value,
                                label: f.name,
                            }))}
                            bind:value={$bodyFont}
                        />
                    </div>
                </div>

                <!-- Custom Fonts -->
                <div class="form-group">
                    <div class="custom-font-row">
                        <Button
                            onclick={handleAddFont}
                            disabled={isInstallingFont}
                        >
                            {isInstallingFont
                                ? $t("settings.fonts.adding")
                                : $t("settings.fonts.add")}
                        </Button>
                        <span class="setting-description">
                            {$t("settings.fonts.addDescription")}
                        </span>
                    </div>
                    {#if fontInstallMessage}
                        <p class="import-message">{fontInstallMessage}</p>
                    {/if}
                </div>

                <!-- Font Size Slider -->
                <div class="form-group">
                    <label for="font-size-slider"
                        >{$t("settings.fonts.size")}</label
                    >
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
            <h4>{$t("settings.templates.title")}</h4>
            <p>{$t("settings.templates.description")}</p>
            <Button onclick={openTemplateManager}
                >{$t("settings.templates.manage")}</Button
            >
        </div>

        <div class="setting-item">
            <h4>{$t("settings.snippets.title")}</h4>
            <p>
                {$t("settings.snippets.description")}
            </p>
            <Button onclick={openSnippetsManager}
                >{$t("settings.snippets.manage")}</Button
            >
        </div>

        <div class="setting-item">
            <h4>{$t("settings.shortcuts.title")}</h4>
            <p>{$t("settings.shortcuts.description")}</p>
            <Button onclick={openKeybindings}
                >{$t("settings.shortcuts.customize")}</Button
            >
        </div>

        <div class="setting-item">
            <h4>{$t("settings.images.title")}</h4>
            <p>{$t("settings.images.description")}</p>
            <div class="form-group">
                <!-- svelte-ignore a11y_label_has_associated_control -->
                <label>{$t("settings.images.location")}</label>
                <Select
                    options={[
                        {
                            value: "folder",
                            label: $t("settings.images.inFolder"),
                        },
                        {
                            value: "adjacent",
                            label: $t("settings.images.nextToPage"),
                        },
                    ]}
                    value={$imageImportLocation}
                    onSelect={(val) =>
                        ($imageImportLocation = val as ImageImportLocation)}
                />
            </div>
            {#if $imageImportLocation === "folder"}
                <div class="form-group">
                    <label for="image-dir-input"
                        >{$t("settings.images.folder")}</label
                    >
                    <input
                        id="image-dir-input"
                        class="setting-text-input"
                        type="text"
                        bind:value={$imageImportDir}
                        placeholder="images"
                    />
                </div>
            {/if}
            <ToggleSwitch
                id="prompt-image-name-toggle"
                label={$t("settings.images.promptName")}
                description={$t("settings.images.promptNameDescription")}
                bind:checked={$promptForImageName}
            />
        </div>

        <div class="setting-item">
            <h4>{$t("settings.vault.title")}</h4>
            <p>{$t("settings.vault.description")}</p>
            <Button onclick={handleChangeVault}
                >{$t("settings.vault.change")}</Button
            >
        </div>

        <div class="setting-item">
            <h4>{$t("settings.import.title")}</h4>
            <p>{$t("settings.import.description")}</p>
            <Button onclick={openImporter}>{$t("settings.import.open")}</Button>
        </div>

        <div class="setting-item">
            <h4>{$t("settings.privacy.title")}</h4>
            <ToggleSwitch
                id="telemetry-toggle"
                label={$t("settings.privacy.telemetry")}
                description={$t("settings.privacy.telemetryDescription")}
                bind:checked={telemetryEnabled}
            />
        </div>

        <div class="setting-item">
            <h4>{$t("settings.license.title")}</h4>
            {#if $licenseStore.status === "licensed"}
                <p>
                    {$t("settings.license.status")}
                    <span class="license-status-active"
                        >{$licenseStore.license?.status}</span
                    >
                </p>
                <p class="license-expiry">
                    {$t("settings.license.expiry", {
                        date: $licenseStore.license?.expiry ?? "",
                    })}
                </p>
                {#if !showLicenseInput}
                    <Button onclick={() => (showLicenseInput = true)}
                        >{$t("settings.license.replace")}</Button
                    >
                {/if}
            {:else}
                <p>
                    {$t("settings.license.supportPre")}
                    <a
                        href="https://chronicler.pro/#support"
                        onclick={(event) => {
                            event.preventDefault();
                            openUrl(DONATE_URL);
                        }}>{$t("settings.license.supportLink")}</a
                    >.
                </p>
            {/if}

            {#if $licenseStore.status !== "licensed" || showLicenseInput}
                <div class="license-input-group">
                    <input
                        type="text"
                        placeholder={$t("settings.license.pastePlaceholder")}
                        bind:value={licenseKeyInput}
                        disabled={isVerifyingLicense}
                    />
                    <Button
                        onclick={verifyLicense}
                        disabled={isVerifyingLicense || !licenseKeyInput}
                    >
                        {#if isVerifyingLicense}
                            {$t("settings.license.verifying")}
                        {:else}
                            {$t("settings.license.verify")}
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
            <p>{$t("settings.footer.version", { version: appVersion })}</p>
            <div class="footer-links">
                <button
                    class="link-button"
                    onclick={() => (showChangelog = true)}
                    >{$t("settings.footer.changelog")}</button
                >
                <span class="separator"> • </span>
                <button class="link-button" onclick={openLogDirectory}
                    >{$t("settings.footer.logs")}</button
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
    .setting-text-input {
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        padding: 0.5rem 0.75rem;
        font-family: inherit;
        font-size: 1rem;
    }
    .setting-text-input:focus {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: -1px;
        border-color: var(--color-accent-primary);
    }
    .font-selectors-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }
    .custom-font-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
    }
</style>
