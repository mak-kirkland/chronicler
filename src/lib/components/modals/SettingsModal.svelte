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
        welcomeBanner,
        type ImageImportLocation,
        type WelcomeBanner,
    } from "$lib/settingsStore";
    import { AVAILABLE_FONTS, BUILT_IN_THEMES } from "$lib/themeRegistry";
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
        systemLocaleCode,
        SYSTEM_LOCALE,
    } from "$lib/i18n";

    let { onClose = () => {} } = $props<{
        onClose?: () => void;
    }>();

    // One scroll of eight headings made everything equally findable, which is
    // to say not findable at all. A rail turns the list into a map: you see
    // every area at once and only the one you picked is on screen.
    type SectionId =
        | "language"
        | "appearance"
        | "templates"
        | "snippets"
        | "shortcuts"
        | "images"
        | "vault"
        | "import"
        | "privacy"
        | "license";

    const sections = $derived<{ id: SectionId; label: string }[]>([
        { id: "language", label: $t("settings.language.title") },
        { id: "appearance", label: $t("settings.appearance.title") },
        { id: "templates", label: $t("settings.templates.title") },
        { id: "snippets", label: $t("settings.snippets.title") },
        { id: "shortcuts", label: $t("settings.shortcuts.title") },
        { id: "images", label: $t("settings.images.title") },
        { id: "vault", label: $t("settings.vault.title") },
        { id: "import", label: $t("settings.import.title") },
        { id: "privacy", label: $t("settings.privacy.title") },
        { id: "license", label: $t("settings.license.title") },
    ]);

    let activeSection = $state<SectionId>("appearance");

    /**
     * Built-in and user themes as one list, so the grid renders them with one
     * block of markup. They differ only in where the three swatch colours come
     * from — a static table for the built-ins, the saved palette for the rest.
     */
    const themeCards = $derived([
        ...BUILT_IN_THEMES.map((theme) => ({
            // Source-tagged, because `name` alone is not unique across the two
            // lists: nothing stops a user theme being called "dark", and a
            // duplicate {#each} key is a hard Svelte error that takes the whole
            // Settings modal down — including the theme editor, the only place
            // the offending theme could be renamed.
            key: `builtin:${theme.id}`,
            name: theme.id as ThemeName,
            label: theme.label,
            swatch: theme.swatch,
        })),
        ...$userThemes.map((theme) => ({
            key: `user:${theme.name}`,
            name: theme.name,
            label: theme.name,
            swatch: {
                background: theme.palette["--color-background-primary"],
                secondary: theme.palette["--color-background-secondary"],
                accent: theme.palette["--color-accent-primary"],
            },
        })),
    ]);

    /** Endonym of the language the OS locale resolves to, e.g. "Polski". */
    const systemLocaleName = $derived(
        $availableLocales.find((l) => l.code === systemLocaleCode())?.name ??
            systemLocaleCode(),
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

<Modal title={$t("settings.title")} {onClose} size="settings" flushBody>
    <div class="settings-layout">
        <nav class="settings-rail">
            <div class="rail-items">
                {#each sections as section (section.id)}
                    <button
                        class="rail-item"
                        class:active={activeSection === section.id}
                        aria-current={activeSection === section.id
                            ? "true"
                            : undefined}
                        onclick={() => (activeSection = section.id)}
                    >
                        {section.label}
                    </button>
                {/each}
            </div>

            <!-- Version and diagnostics belong to the app, not to any one
                 section, so they sit at the foot of the rail rather than
                 trailing whichever pane happens to be open. -->
            <div class="rail-footer">
                {#if appVersion}
                    <p>
                        {$t("settings.footer.version", { version: appVersion })}
                    </p>
                {/if}
                <button
                    class="link-button"
                    onclick={() => (showChangelog = true)}
                >
                    {$t("settings.footer.changelog")}
                </button>
                <button class="link-button" onclick={openLogDirectory}>
                    {$t("settings.footer.logs")}
                </button>
            </div>
        </nav>

        <div class="settings-pane">
            {#if activeSection === "language"}
                <section class="setting-item">
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
                            onSelect={(val) => languagePreference.set(val)}
                        />
                    </div>
                </section>
            {:else if activeSection === "appearance"}
                <section class="setting-item">
                    <h4>{$t("settings.appearance.title")}</h4>
                    <p>{$t("settings.appearance.description")}</p>

                    <!-- Themes as swatches, not names in a dropdown: the whole
                         point of a theme is what it looks like. -->
                    <div class="theme-grid">
                        {#each themeCards as theme (theme.key)}
                            <button
                                class="theme-card"
                                class:selected={$activeTheme === theme.name}
                                aria-pressed={$activeTheme === theme.name}
                                onclick={() => setActiveTheme(theme.name)}
                            >
                                <span class="swatch">
                                    <span
                                        style="background: {theme.swatch
                                            .background}"
                                    ></span>
                                    <span
                                        style="background: {theme.swatch
                                            .secondary}"
                                    ></span>
                                    <span
                                        style="background: {theme.swatch
                                            .accent}"
                                    ></span>
                                </span>
                                <span class="theme-name">{theme.label}</span>
                            </button>
                        {/each}

                        <button
                            class="theme-card manage-card"
                            onclick={openThemeEditor}
                        >
                            <span class="manage-plus">+</span>
                            <span class="theme-name"
                                >{$t("settings.appearance.manageThemes")}</span
                            >
                        </button>
                    </div>

                    <div class="form-group">
                        <!-- svelte-ignore a11y_label_has_associated_control -->
                        <label>{$t("settings.appearance.welcomeBanner")}</label>
                        <Select
                            options={[
                                {
                                    value: "default",
                                    label: $t(
                                        "settings.appearance.welcomeBannerDefault",
                                    ),
                                },
                                {
                                    value: "scifi",
                                    label: $t(
                                        "settings.appearance.welcomeBannerScifi",
                                    ),
                                },
                            ]}
                            value={$welcomeBanner}
                            onSelect={(val) =>
                                ($welcomeBanner = val as WelcomeBanner)}
                        />
                    </div>

                    <!-- Atmosphere is a look, not a category of its own: it
                         swaps icons and textures, so it belongs beside the
                         theme swatches that set everything else's colour. -->
                    <h5 class="eyebrow subsection">
                        {$t("settings.atmosphere.title")}
                    </h5>
                    <div class="form-group">
                        <p class="setting-description">
                            {$t("settings.atmosphere.description")}
                        </p>
                        <div class="subsection-action">
                            <Button onclick={openAtmosphereManager}
                                >{$t("settings.atmosphere.customize")}</Button
                            >
                        </div>
                    </div>

                    <h5 class="eyebrow subsection">
                        {$t("settings.typography.title")}
                    </h5>

                    <div class="font-selectors-grid">
                        <div class="form-group">
                            <!-- svelte-ignore a11y_label_has_associated_control -->
                            <label class="eyebrow"
                                >{$t("settings.fonts.heading")}</label
                            >
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
                            <label class="eyebrow"
                                >{$t("settings.fonts.body")}</label
                            >
                            <Select
                                options={allAvailableFonts.map((f) => ({
                                    value: f.value,
                                    label: f.name,
                                }))}
                                bind:value={$bodyFont}
                            />
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="eyebrow" for="font-size-slider"
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
                                    setFontSize(
                                        parseInt(e.currentTarget.value),
                                    )}
                            />
                            <span class="font-size-label">{$fontSize}%</span>
                        </div>
                    </div>

                    <!-- "Add Font…" used to share the slider's line, which put
                         three unrelated controls — a range, a readout and a
                         file picker — on one row. It gets its own footer with
                         the sentence that explains it. -->
                    <div class="add-font-row">
                        <span class="setting-description">
                            {$t("settings.fonts.addDescription")}
                        </span>
                        <button
                            class="dashed-action"
                            onclick={handleAddFont}
                            disabled={isInstallingFont}
                        >
                            {isInstallingFont
                                ? $t("settings.fonts.adding")
                                : $t("settings.fonts.add")}
                        </button>
                    </div>
                    {#if fontInstallMessage}
                        <p class="import-message">{fontInstallMessage}</p>
                    {/if}

                    <!-- Font and size choices are invisible until you close the
                         modal and look at a page. This shows them here. -->
                    <div class="type-preview">
                        <span class="eyebrow">
                            {$t("settings.typography.preview")}
                        </span>
                        <p class="preview-heading">
                            {$t("settings.typography.previewHeading")}
                        </p>
                        <p class="preview-body">
                            {$t("settings.typography.previewBody")}
                            <a
                                href="https://chronicler.pro"
                                onclick={(e) => e.preventDefault()}
                            >
                                {$t("settings.typography.previewLink")}
                            </a>
                        </p>
                    </div>
                </section>
            {:else if activeSection === "templates"}
                <section class="setting-item">
                    <h4>{$t("settings.templates.title")}</h4>
                    <p>{$t("settings.templates.description")}</p>
                    <Button onclick={openTemplateManager}
                        >{$t("settings.templates.manage")}</Button
                    >
                </section>
            {:else if activeSection === "snippets"}
                <section class="setting-item">
                    <h4>{$t("settings.snippets.title")}</h4>
                    <p>{$t("settings.snippets.description")}</p>
                    <Button onclick={openSnippetsManager}
                        >{$t("settings.snippets.manage")}</Button
                    >
                </section>
            {:else if activeSection === "shortcuts"}
                <section class="setting-item">
                    <h4>{$t("settings.shortcuts.title")}</h4>
                    <p>{$t("settings.shortcuts.description")}</p>
                    <Button onclick={openKeybindings}
                        >{$t("settings.shortcuts.customize")}</Button
                    >
                </section>
            {:else if activeSection === "images"}
                <section class="setting-item">
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
                                ($imageImportLocation =
                                    val as ImageImportLocation)}
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
                        description={$t(
                            "settings.images.promptNameDescription",
                        )}
                        bind:checked={$promptForImageName}
                    />
                </section>
            {:else if activeSection === "vault"}
                <section class="setting-item">
                    <h4>{$t("settings.vault.title")}</h4>
                    <p>{$t("settings.vault.description")}</p>
                    <Button onclick={handleChangeVault}
                        >{$t("settings.vault.change")}</Button
                    >
                </section>
            {:else if activeSection === "import"}
                <section class="setting-item">
                    <h4>{$t("settings.import.title")}</h4>
                    <p>{$t("settings.import.description")}</p>
                    <Button onclick={openImporter}
                        >{$t("settings.import.open")}</Button
                    >
                </section>
            {:else if activeSection === "privacy"}
                <section class="setting-item">
                    <h4>{$t("settings.privacy.title")}</h4>
                    <ToggleSwitch
                        id="telemetry-toggle"
                        label={$t("settings.privacy.telemetry")}
                        description={$t(
                            "settings.privacy.telemetryDescription",
                        )}
                        bind:checked={telemetryEnabled}
                    />
                </section>
            {:else if activeSection === "license"}
                <section class="setting-item">
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
                                placeholder={$t(
                                    "settings.license.pastePlaceholder",
                                )}
                                bind:value={licenseKeyInput}
                                disabled={isVerifyingLicense}
                            />
                            <Button
                                onclick={verifyLicense}
                                disabled={isVerifyingLicense ||
                                    !licenseKeyInput}
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
                </section>
            {/if}
        </div>
    </div>
</Modal>

{#if showChangelog}
    <ChangelogModal onClose={() => (showChangelog = false)} />
{/if}

<style>
    .settings-layout {
        display: flex;
        /* A fixed height rather than one that follows the content: the pane
           changes on every rail click, and a modal that resizes underneath
           the cursor is disorienting. */
        height: 660px;
        max-height: 78vh;
    }

    .settings-rail {
        width: 206px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        border-right: 1px solid var(--color-border-primary);
        background: var(--color-overlay-subtle);
        overflow-y: auto;
    }

    .rail-items {
        display: flex;
        flex-direction: column;
        padding: 0.5rem 0;
    }

    .rail-item {
        text-align: left;
        background: none;
        border: none;
        padding: 0.55rem 1rem;
        font-family: inherit;
        font-size: 0.92rem;
        color: var(--color-text-secondary);
        cursor: pointer;
        transition:
            background-color 0.15s,
            color 0.15s;
    }
    .rail-item:hover {
        color: var(--color-text-primary);
        background: var(--color-overlay-light);
    }
    .rail-item.active {
        background: var(--color-background-secondary);
        box-shadow: inset 2px 0 0 var(--color-accent-primary);
        color: var(--color-text-primary);
    }

    .rail-footer {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25rem;
        padding: 0.75rem 1rem;
        border-top: 1px solid var(--color-border-primary);
        font-size: 0.78rem;
        color: var(--color-text-secondary);
    }
    .rail-footer p {
        margin: 0 0 0.15rem;
        font-size: 0.78rem;
    }

    .settings-pane {
        flex-grow: 1;
        min-width: 0;
        overflow-y: auto;
        padding: 1.25rem 1.5rem;
    }

    .setting-item {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }
    h4 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 400;
        color: var(--color-text-heading);
    }
    .subsection {
        margin: 0.75rem 0 0;
    }
    /* Keeps a lone action button at its natural width — .setting-item is a
       stretch-aligned column, so an unwrapped button spans the whole pane. */
    .subsection-action {
        display: flex;
    }

    /* --- Theme swatch cards --- */
    .theme-grid {
        /* Not a fixed four columns: the labels are user- and locale-supplied,
           and the whole grid rescales with the font-size setting, so let the
           column count fall to whatever still fits a readable label. */
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
        gap: 10px;
    }
    .theme-card {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 0;
        background: none;
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        overflow: hidden;
        cursor: pointer;
        font-family: inherit;
        text-align: left;
        transition: border-color 0.15s;
    }
    .theme-card:hover {
        border-color: var(--color-accent-primary);
    }
    .theme-card.selected {
        border-color: var(--color-accent-primary);
        box-shadow: 0 0 0 1px var(--color-accent-primary);
    }
    .swatch {
        display: flex;
        height: 44px;
    }
    .swatch > span {
        flex: 1;
    }
    .theme-name {
        font-size: 0.72rem;
        line-height: 1.3;
        color: var(--color-text-primary);
        padding: 0 6px 6px;
        /* Wrap rather than ellipsise. A truncated "Manage Them…" is worse than
           a two-line label, and grid rows stretch to match so the cards in a
           row stay the same height either way. */
        overflow-wrap: anywhere;
    }
    .manage-card {
        border-style: dashed;
        align-items: center;
        justify-content: center;
    }
    .manage-card .theme-name {
        text-align: center;
    }
    .manage-plus {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 44px;
        font-size: 1.4rem;
        color: var(--color-text-secondary);
    }

    /* --- Typography preview --- */
    .type-preview {
        display: flex;
        flex-direction: column;
        gap: 6px;
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        padding: 14px 16px;
        background: var(--color-overlay-subtle);
    }
    .preview-heading {
        font-family: var(--font-family-heading);
        color: var(--color-text-heading);
        font-size: 1.4rem;
        margin: 0;
    }
    .preview-body {
        font-family: var(--font-family-body);
        margin: 0;
        line-height: 1.6;
    }
    /* The sentence under a pane title introduces the settings below it; at
       primary colour and 0.95rem it carried the same weight as the settings
       themselves. */
    .setting-item p {
        margin: 0;
        color: var(--color-text-secondary);
        font-size: 0.9rem;
    }
    /* Add specific style for the setting description to reduce margin */
    .setting-description {
        margin-bottom: 0.5rem !important;
        font-size: 0.9rem !important;
        color: var(--color-text-secondary) !important;
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
    .font-slider-container {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .font-slider-container input[type="range"] {
        flex-grow: 1;
    }
    .font-size-label {
        font-family: var(--font-mono);
        font-size: 0.72rem;
        font-variant-numeric: tabular-nums;
        color: var(--color-text-secondary);
        min-width: 4ch;
        text-align: right;
    }

    /* Its own footer, with a rule above it: the explanation and the action it
       explains, rather than a third control wedged onto the slider's line. */
    .add-font-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-top: 0.5rem;
        padding-top: 0.85rem;
        border-top: 1px solid var(--hairline-soft);
    }

    .dashed-action {
        flex-shrink: 0;
        padding: 0.35rem 0.8rem;
        border: 1px dashed var(--color-border-primary);
        border-radius: 6px;
        background: none;
        color: var(--color-text-secondary);
        font-family: var(--font-family-heading);
        font-size: 0.62rem;
        letter-spacing: var(--label-tracking);
        text-transform: uppercase;
        cursor: pointer;
        transition:
            border-color 0.15s,
            color 0.15s;
    }

    .dashed-action:hover:not(:disabled) {
        border-style: solid;
        border-color: var(--color-accent-primary);
        color: var(--color-accent-primary);
    }

    .dashed-action:disabled {
        opacity: 0.6;
        cursor: not-allowed;
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
</style>
