<script lang="ts">
    import { get } from "svelte/store";
    import { confirm, open, save, message } from "@tauri-apps/plugin-dialog";
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Select from "$lib/components/ui/Select.svelte";
    import { log } from "$lib/logger";
    import { saveThemeToDisk, importThemeFromPath } from "$lib/commands";
    import {
        activeTheme,
        userThemes,
        setActiveTheme,
        saveCustomTheme,
        deleteCustomTheme,
        forceThemeRefresh,
        type CustomTheme,
        type ThemeName,
        userFonts,
    } from "$lib/settingsStore";
    import {
        THEME_PALETTE_KEYS,
        SYNTAX_PALETTE_KEYS,
        type ThemePalette,
        AVAILABLE_FONTS,
        BUILT_IN_THEME_FONTS,
    } from "$lib/themeRegistry";
    import { t } from "$lib/i18n";

    let { onClose } = $props<{ onClose: () => void }>();

    // --- State ---
    let currentTheme: CustomTheme | null = $state(null);
    let originalName: ThemeName | null = $state(null);
    // Bound to the clone-picker so we can reset it back to placeholder after each clone.
    let cloneSourceName: string | undefined = $state(undefined);

    // --- Clone Source Options ---
    // Built-ins live in CSS and need a probe to resolve; user themes carry
    // their own palette. The `kind:` prefix in the value disambiguates them
    // (a user theme could in principle share a name with a built-in).
    function titleCase(name: string): string {
        return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    const cloneOptions = $derived([
        ...Object.keys(BUILT_IN_THEME_FONTS).map((name) => ({
            value: `builtin:${name}`,
            label: titleCase(name),
        })),
        ...$userThemes.map((t) => ({
            value: `user:${t.name}`,
            label: t.name,
        })),
    ]);

    // --- Computed Font List ---
    const allAvailableFonts = $derived([
        ...AVAILABLE_FONTS,
        ...$userFonts.map((f) => ({ name: f.name, value: `"${f.name}"` })),
    ]);

    const fontOptions = $derived([
        { value: "", label: $t("theme.fontDefault") },
        ...allAvailableFonts.map((f) => ({
            value: f.value,
            label: f.name,
        })),
    ]);

    // --- Constants ---
    const colorLabels = $derived<Record<string, string>>({
        // UI Colors
        "--color-background-primary": $t("theme.color.backgroundPrimary"),
        "--color-background-secondary": $t("theme.color.backgroundSecondary"),
        "--color-background-tertiary": $t("theme.color.backgroundTertiary"),
        "--color-text-heading": $t("theme.color.headings"),
        "--color-text-primary": $t("theme.color.body"),
        "--color-text-secondary": $t("theme.color.textSecondary"),
        "--color-border-primary": $t("theme.color.borders"),
        "--color-accent-primary": $t("theme.color.accent"),
        "--color-icons": $t("theme.color.icons"),
        "--color-text-link": $t("theme.color.links"),
        "--color-text-link-broken": $t("theme.color.brokenLinks"),
        "--color-text-error": $t("theme.color.errors"),

        // Syntax Colors
        "--code-tag": $t("theme.color.htmlTags"),
        "--code-attribute": $t("theme.color.attributes"),
        "--code-string": $t("theme.color.strings"),
    });

    // Visual grouping for the editor — purely presentational, the underlying
    // palette is still THEME_PALETTE_KEYS.
    const COLOR_SUBGROUPS = $derived<
        Array<{
            title: string;
            keys: ReadonlyArray<keyof ThemePalette>;
        }>
    >([
        {
            title: $t("theme.groupSurfaces"),
            keys: [
                "--color-background-primary",
                "--color-background-secondary",
                "--color-background-tertiary",
            ],
        },
        {
            title: $t("theme.groupInk"),
            keys: [
                "--color-text-heading",
                "--color-text-primary",
                "--color-text-secondary",
            ],
        },
        {
            title: $t("theme.groupAccents"),
            keys: [
                "--color-border-primary",
                "--color-accent-primary",
                "--color-icons",
            ],
        },
        {
            title: $t("theme.groupSignals"),
            keys: [
                "--color-text-link",
                "--color-text-link-broken",
                "--color-text-error",
            ],
        },
        { title: $t("theme.groupCode"), keys: SYNTAX_PALETTE_KEYS },
    ]);

    const defaultPalette: ThemePalette = {
        // UI Defaults
        "--color-background-primary": "#fdf6e3",
        "--color-background-secondary": "#e6dcc9",
        "--color-background-tertiary": "#dcd3c3",
        "--color-text-heading": "#6a5f55",
        "--color-text-primary": "#4a3f35",
        "--color-text-secondary": "#6a5f55",
        "--color-border-primary": "#d3c7b3",
        "--color-accent-primary": "#6a5f55",
        "--color-icons": "#6a5f55",
        "--color-text-link": "#2563eb",
        "--color-text-link-broken": "#b04a4a",
        "--color-text-error": "#8b0000",

        // Syntax Defaults (Parchment)
        "--code-tag": "#b58900",
        "--code-attribute": "#268bd2",
        "--code-string": "#2aa198",
    };

    // --- Helper Functions ---
    function clearLivePreviewStyles() {
        for (const key of THEME_PALETTE_KEYS) {
            document.documentElement.style.removeProperty(key);
        }
        document.documentElement.style.removeProperty("--font-family-heading");
        document.documentElement.style.removeProperty("--font-family-body");
    }

    // --- Component Logic ---
    $effect(() => {
        // When the modal is closed, force the global theme handler to re-apply the correct theme.
        return () => {
            forceThemeRefresh();
        };
    });

    $effect(() => {
        // Live preview effect
        if (currentTheme) {
            for (const [key, value] of Object.entries(currentTheme.palette)) {
                document.documentElement.style.setProperty(
                    key,
                    value as string,
                );
            }

            if (currentTheme.headingFont) {
                document.documentElement.style.setProperty(
                    "--font-family-heading",
                    currentTheme.headingFont,
                );
            } else {
                document.documentElement.style.removeProperty(
                    "--font-family-heading",
                );
            }
            if (currentTheme.bodyFont) {
                document.documentElement.style.setProperty(
                    "--font-family-body",
                    currentTheme.bodyFont,
                );
            } else {
                document.documentElement.style.removeProperty(
                    "--font-family-body",
                );
            }

            return () => {
                clearLivePreviewStyles();
            };
        }
    });

    function createNewTheme() {
        currentTheme = {
            name: $t("theme.newThemeName"),
            palette: { ...defaultPalette },
            // Optional: Default to current fonts or leave undefined
        };
        originalName = null;
    }

    /**
     * Resolves a built-in theme's full palette by applying it to a hidden
     * probe and reading the computed CSS variables. We can't just read the
     * `[data-theme="..."]` block directly because most built-ins inherit
     * many keys from `:root` rather than overriding them.
     */
    function resolveBuiltInPalette(themeName: string): ThemePalette {
        const probe = document.createElement("div");
        probe.setAttribute("data-theme", themeName);
        probe.style.display = "none";
        document.body.appendChild(probe);
        try {
            const cs = getComputedStyle(probe);
            const palette = {} as ThemePalette;
            for (const key of THEME_PALETTE_KEYS) {
                palette[key] = cs.getPropertyValue(key).trim();
            }
            return palette;
        } finally {
            probe.remove();
        }
    }

    function uniqueThemeName(base: string): string {
        const taken = new Set(get(userThemes).map((t) => t.name));
        if (!taken.has(base)) return base;
        let i = 2;
        while (taken.has(`${base} (${i})`)) i++;
        return `${base} (${i})`;
    }

    function applyClone(
        sourceName: string,
        palette: ThemePalette,
        headingFont?: string,
        bodyFont?: string,
    ) {
        currentTheme = {
            name: uniqueThemeName($t("theme.copyName", { name: sourceName })),
            palette: { ...palette },
            headingFont,
            bodyFont,
        };
        originalName = null;
        cloneSourceName = undefined;
    }

    function handleCloneSelect(value: string) {
        const sep = value.indexOf(":");
        const kind = value.slice(0, sep);
        const name = value.slice(sep + 1);
        if (kind === "builtin") {
            const fonts = BUILT_IN_THEME_FONTS[name];
            applyClone(
                titleCase(name),
                resolveBuiltInPalette(name),
                fonts?.heading,
                fonts?.body,
            );
        } else {
            const source = get(userThemes).find((t) => t.name === name);
            if (source) {
                applyClone(
                    source.name,
                    source.palette,
                    source.headingFont,
                    source.bodyFont,
                );
            }
        }
    }

    function editTheme(theme: CustomTheme) {
        // Deep copy to avoid mutating the original store object.
        // We rely on the store having already filled missing colors on load.
        currentTheme = JSON.parse(JSON.stringify(theme));
        originalName = theme.name;
    }

    async function handleSave() {
        const themeToSave = currentTheme;
        if (!themeToSave || !themeToSave.name.trim()) {
            await message($t("theme.emptyName"), {
                title: $t("theme.invalidTheme"),
                kind: "warning",
            });
            return;
        }

        const isRenaming = originalName && originalName !== themeToSave.name;
        const wasActive = get(activeTheme) === originalName;

        if (
            isRenaming &&
            $userThemes.some((t) => t.name === themeToSave.name)
        ) {
            await message($t("theme.nameExists"), {
                title: $t("theme.nameConflict"),
                kind: "warning",
            });
            return;
        }

        // Order matters: delete the old file BEFORE writing the new one so a
        // failed delete can't orphan the rename.
        if (isRenaming) {
            await deleteCustomTheme(originalName as ThemeName);
        }

        await saveCustomTheme(themeToSave);
        originalName = themeToSave.name;

        if (isRenaming && wasActive) {
            setActiveTheme(themeToSave.name);
        }
    }

    async function handleDelete() {
        const themeToDelete = currentTheme;
        if (!themeToDelete) return;

        const prompt = $t("theme.deleteConfirm", { name: themeToDelete.name });
        if (
            await confirm(prompt, {
                title: $t("theme.confirmDeletion"),
            })
        ) {
            await deleteCustomTheme(themeToDelete.name);
            currentTheme = null;
            originalName = null;
        }
    }

    /**
     * Writes the currently-edited theme to a user-chosen `.json` file. The
     * exported file is the same JSON shape we read back on import.
     */
    async function handleExport() {
        const themeToExport = currentTheme;
        if (!themeToExport) return;

        const defaultName =
            themeToExport.name.trim().replace(/[^a-z0-9-]+/gi, "-") || "theme";
        const targetPath = await save({
            title: $t("theme.exportTitle"),
            defaultPath: `${defaultName}.json`,
            filters: [{ name: $t("theme.jsonFilter"), extensions: ["json"] }],
        });
        if (!targetPath) return;

        try {
            await saveThemeToDisk(themeToExport, targetPath);
        } catch (e) {
            log.error(
                `Failed to export theme "${themeToExport.name}"`,
                e,
                "theme-editor",
            );
            await message($t("theme.exportFailedBody", { error: String(e) }), {
                title: $t("theme.exportFailed"),
                kind: "error",
            });
        }
    }

    /**
     * Validates that a parsed JSON value at least has the fields a
     * CustomTheme needs. We accept missing palette entries (the live load
     * path fills them via fillMissingColors) but require a name + palette.
     */
    function asCustomTheme(value: unknown): CustomTheme | null {
        if (!value || typeof value !== "object") return null;
        const v = value as Record<string, unknown>;
        if (typeof v.name !== "string" || !v.name.trim()) return null;
        if (!v.palette || typeof v.palette !== "object") return null;
        const out: CustomTheme = {
            name: v.name.trim(),
            palette: v.palette as ThemePalette,
        };
        if (typeof v.headingFont === "string") out.headingFont = v.headingFont;
        if (typeof v.bodyFont === "string") out.bodyFont = v.bodyFont;
        return out;
    }

    async function handleImport() {
        const picked = await open({
            title: $t("theme.importTitle"),
            multiple: false,
            filters: [{ name: $t("theme.jsonFilter"), extensions: ["json"] }],
        });
        if (!picked || typeof picked !== "string") return;

        let parsed: unknown;
        try {
            parsed = await importThemeFromPath(picked);
        } catch (e) {
            log.error("Failed to read theme file", e, "theme-editor");
            await message(
                $t("theme.importReadFailedBody", { error: String(e) }),
                {
                    title: $t("theme.importFailed"),
                    kind: "error",
                },
            );
            return;
        }

        const theme = asCustomTheme(parsed);
        if (!theme) {
            await message($t("theme.importInvalidBody"), {
                title: $t("theme.invalidTheme"),
                kind: "error",
            });
            return;
        }

        // Auto-rename on collision so the import never silently overwrites
        // an existing theme.
        theme.name = uniqueThemeName(theme.name);

        try {
            await saveCustomTheme(theme);
        } catch (e) {
            await message(
                $t("theme.importSaveFailedBody", { error: String(e) }),
                {
                    title: $t("theme.importFailed"),
                    kind: "error",
                },
            );
            return;
        }

        editTheme(theme);
    }
</script>

<Modal title={$t("theme.editorTitle")} {onClose} size="wide">
    <div class="editor" class:no-specimen={!currentTheme}>
        <aside class="sidebar">
            <header class="sidebar-header">
                <span class="eyebrow">{$t("theme.library")}</span>
                <span class="count">{$userThemes.length}</span>
            </header>

            <div class="theme-list">
                {#if $userThemes.length > 0}
                    {#each $userThemes as theme (theme.name)}
                        <button
                            type="button"
                            class="theme-card"
                            class:active={originalName === theme.name}
                            onclick={() => editTheme(theme)}
                        >
                            <span class="theme-card-name">{theme.name}</span>
                            <span
                                class="theme-card-swatches"
                                aria-hidden="true"
                            >
                                <span
                                    style:background={theme.palette[
                                        "--color-background-primary"
                                    ]}
                                ></span>
                                <span
                                    style:background={theme.palette[
                                        "--color-accent-primary"
                                    ]}
                                ></span>
                                <span
                                    style:background={theme.palette[
                                        "--color-text-primary"
                                    ]}
                                ></span>
                                <span
                                    style:background={theme.palette[
                                        "--color-text-link"
                                    ]}
                                ></span>
                            </span>
                        </button>
                    {/each}
                {:else}
                    <p class="empty-list">{$t("theme.noCustomThemes")}</p>
                {/if}
            </div>

            <footer class="sidebar-actions">
                <Button onclick={createNewTheme}>{$t("theme.new")}</Button>
                <Button onclick={handleImport}>{$t("theme.import")}</Button>
                <Select
                    options={cloneOptions}
                    bind:value={cloneSourceName}
                    placeholder={$t("theme.duplicateFrom")}
                    onSelect={handleCloneSelect}
                />
            </footer>
        </aside>

        <main class="canvas">
            {#if currentTheme}
                <header class="canvas-header">
                    <span class="eyebrow">
                        {originalName
                            ? $t("theme.editing")
                            : $t("theme.newEyebrow")}
                    </span>
                    <input
                        class="title-input"
                        type="text"
                        bind:value={currentTheme.name}
                        spellcheck="false"
                        aria-label={$t("theme.nameAriaLabel")}
                    />
                </header>

                <section class="canvas-section">
                    <h5 class="eyebrow section-title">
                        {$t("theme.typography")}
                    </h5>
                    <div class="font-row">
                        <div class="font-field">
                            <span class="field-label"
                                >{$t("theme.headingFont")}</span
                            >
                            <Select
                                options={fontOptions}
                                bind:value={currentTheme.headingFont}
                            />
                        </div>
                        <div class="font-field">
                            <span class="field-label"
                                >{$t("theme.bodyFont")}</span
                            >
                            <Select
                                options={fontOptions}
                                bind:value={currentTheme.bodyFont}
                            />
                        </div>
                    </div>
                </section>

                {#each COLOR_SUBGROUPS as group (group.title)}
                    <section class="canvas-section">
                        <h5 class="eyebrow section-title">{group.title}</h5>
                        <div class="swatch-grid">
                            {#each group.keys as key (key)}
                                <div class="swatch">
                                    <div
                                        class="swatch-chip"
                                        style:background={currentTheme.palette[
                                            key
                                        ]}
                                    >
                                        <input
                                            type="color"
                                            bind:value={
                                                currentTheme.palette[key]
                                            }
                                            aria-label={colorLabels[key] || key}
                                        />
                                    </div>
                                    <div class="swatch-meta">
                                        <span class="swatch-name"
                                            >{colorLabels[key] || key}</span
                                        >
                                        <input
                                            type="text"
                                            class="swatch-hex"
                                            bind:value={
                                                currentTheme.palette[key]
                                            }
                                            spellcheck="false"
                                        />
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </section>
                {/each}

                <footer class="canvas-actions">
                    <Button type="button" variant="accent" onclick={handleSave}
                        >{$t("theme.save")}</Button
                    >
                    <Button type="button" onclick={handleExport}
                        >{$t("theme.export")}</Button
                    >
                    {#if originalName}
                        <!-- Pushed away from Save so a mis-click can't destroy
                             the theme you were about to keep. -->
                        <Button
                            type="button"
                            class="delete-action"
                            onclick={handleDelete}>{$t("common.delete")}</Button
                        >
                    {/if}
                </footer>
            {:else}
                <div class="empty-canvas">
                    <span class="eyebrow">{$t("theme.editorTitle")}</span>
                    <h4>{$t("theme.emptyCanvas")}</h4>
                </div>
            {/if}
        </main>

        <!--
            Fifteen palette keys judged one hex field at a time tells you
            nothing about whether they work together. This card is the only
            place they all appear at once, painted with the theme being edited
            — the live-preview effect above has already applied it to the
            document, so these plain var() references resolve to the in-progress
            palette without any extra wiring.
        -->
        {#if currentTheme}
            <aside class="specimen">
                <span class="eyebrow">{$t("theme.specimen")}</span>

                <div class="specimen-card">
                    <div class="specimen-band">
                        {$t("theme.specimenHeading")}
                    </div>
                    <div class="specimen-body">
                        <p>
                            {$t("theme.specimenBody")}
                            <a
                                href="#specimen"
                                onclick={(e) => e.preventDefault()}
                                >{$t("theme.specimenLink")}</a
                            >
                            {$t("theme.specimenAnd")}
                            <span class="broken-link"
                                >{$t("theme.specimenBrokenLink")}</span
                            >.
                        </p>

                        <!--
                            The prose above is translated; the sample data from
                            here down deliberately isn't. These are colour
                            swatches that happen to contain text — the point is
                            the tag pill's fill and the YAML syntax colours, not
                            the words. Keying them would put "Aurelia Venn" in
                            front of every volunteer translator for no gain.
                        -->
                        <div class="specimen-tags">
                            <span class="tag-pill">places/cities</span>
                            <span class="tag-pill">era/third-age</span>
                        </div>

                        <pre class="specimen-code"><span class="code-tag"
                                >ruler</span
                            ><span class="code-punct">:</span>
<span class="code-attribute">  name</span><span class="code-punct"
                                >: </span><span class="code-string"
                                >"Aurelia Venn"</span
                            ></pre>

                        <p class="specimen-error">
                            {$t("theme.specimenError")}
                        </p>
                    </div>
                </div>

                <p class="specimen-caption">{$t("theme.specimenCaption")}</p>
            </aside>
        {/if}
    </div>
</Modal>

<style>
    /* Library · editor · specimen. The specimen is a fixed column rather than
       part of the scrolling canvas so it stays in view while you work down the
       palette. */
    .editor {
        display: grid;
        grid-template-columns: 240px minmax(0, 1fr) 262px;
        gap: 1.25rem;
        height: 65vh;
        min-height: 480px;
        max-height: 640px;
    }
    /* With no theme picked there's nothing to specimen, so drop the track
       rather than leaving 262px of empty modal beside the prompt. */
    .editor.no-specimen {
        grid-template-columns: 240px minmax(0, 1fr);
    }

    /* ---- Sidebar ---- */
    .sidebar {
        display: flex;
        flex-direction: column;
        border-right: 1px solid var(--color-border-primary);
        padding-right: 1.25rem;
        min-height: 0;
    }
    .sidebar-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-bottom: 0.75rem;
    }
    /* .eyebrow now lives in app.css — this component's version was the
       prototype for it. */
    .count {
        font-size: 0.85rem;
        color: var(--color-text-secondary);
        font-variant-numeric: tabular-nums;
    }
    .theme-list {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        padding-right: 0.2rem;
    }
    .theme-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        width: 100%;
        background: none;
        border: 1px solid transparent;
        color: var(--color-text-primary);
        text-align: left;
        padding: 0.5rem 0.65rem;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.95rem;
        transition:
            background-color 0.15s ease,
            border-color 0.15s ease;
    }
    .theme-card:hover {
        background-color: var(--color-background-secondary);
    }
    .theme-card.active {
        background-color: var(--color-background-secondary);
        border-color: var(--color-border-primary);
    }
    .theme-card-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }
    .theme-card-swatches {
        display: flex;
        gap: 2px;
        flex-shrink: 0;
    }
    .theme-card-swatches > span {
        width: 8px;
        height: 18px;
        border-radius: 1px;
        border: 1px solid var(--color-border-primary);
    }
    .empty-list {
        color: var(--color-text-secondary);
        font-style: italic;
        font-size: 0.9rem;
        padding: 1rem 0.5rem;
        margin: 0;
    }
    .sidebar-actions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border-primary);
    }

    /* ---- Canvas ---- */
    .canvas {
        overflow-y: auto;
        min-height: 0;
        padding: 0 0.75rem 0 0.25rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        position: relative;
    }
    .canvas-header {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }
    .title-input {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        background: transparent;
        border: none;
        border-bottom: 1px solid transparent;
        color: var(--color-text-heading);
        font-family: var(--font-family-heading);
        font-size: 1.6rem;
        padding: 0.15rem 0;
        margin: 0;
        line-height: 1.2;
        transition: border-color 0.2s ease;
    }
    .title-input:focus {
        outline: none;
        border-bottom-color: var(--color-border-primary);
    }

    .canvas-section {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }
    /* Type comes from .eyebrow in app.css; only the rule beneath is local. */
    .section-title {
        margin: 0 0 0.6rem;
        padding-bottom: 0.35rem;
        border-bottom: 1px solid var(--color-border-primary);
    }

    /* ---- Swatches ---- */
    /* Exactly three columns: every subgroup holds three keys, so each group
       lands on one row and all five fit without scrolling. */
    .swatch-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
    }
    .swatch {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.4rem 0.45rem;
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        background: var(--color-background-secondary);
        min-width: 0;
    }
    .swatch-chip {
        position: relative;
        width: 32px;
        height: 32px;
        border-radius: 4px;
        flex-shrink: 0;
        box-shadow: inset 0 0 0 1px var(--color-overlay-light);
        overflow: hidden;
    }
    .swatch-chip input[type="color"] {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: none;
        background: transparent;
        padding: 0;
        cursor: pointer;
        opacity: 0;
    }
    .swatch-meta {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        min-width: 0;
        flex: 1;
    }
    .swatch-name {
        font-size: 0.78rem;
        color: var(--color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: 0.02em;
    }
    .swatch-hex {
        font-family: ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace;
        font-size: 0.82rem;
        background: var(--color-background-primary);
        border: 1px solid var(--color-border-primary);
        color: var(--color-text-primary);
        border-radius: 3px;
        padding: 0.2rem 0.35rem;
        width: 100%;
        box-sizing: border-box;
    }
    .swatch-hex:focus {
        outline: 1px solid var(--color-accent-primary);
        outline-offset: 1px;
    }

    /* ---- Typography ---- */
    .font-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.85rem;
    }
    .font-field {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 0;
    }
    .field-label {
        font-size: 0.78rem;
        color: var(--color-text-secondary);
        letter-spacing: 0.02em;
    }

    /* ---- Sticky actions ---- */
    .canvas-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        position: sticky;
        bottom: 0;
        background: var(--color-background-primary);
        padding: 0.85rem 0 0.25rem;
        margin: 0.25rem -0.75rem 0 -0.25rem;
        padding-left: 0.25rem;
        padding-right: 0.75rem;
        border-top: 1px solid var(--color-border-primary);
    }
    .canvas-actions :global(.delete-action) {
        margin-left: auto;
        color: var(--color-text-error);
    }
    .canvas-actions :global(.delete-action:hover:not(:disabled)) {
        background-color: var(--color-background-error);
    }

    /* ---- Specimen ---- */
    .specimen {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        min-height: 0;
        overflow-y: auto;
        border-left: 1px solid var(--color-border-primary);
        padding-left: 1.25rem;
    }
    .specimen-card {
        border: 1px solid var(--color-border-primary);
        border-radius: 8px;
        overflow: hidden;
        background: var(--color-background-primary);
    }
    .specimen-band {
        background: var(--color-background-secondary);
        color: var(--color-text-heading);
        font-family: var(--font-family-heading);
        font-size: 1rem;
        padding: 0.6rem 0.75rem;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .specimen-body {
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        font-family: var(--font-family-body);
        font-size: 0.82rem;
        line-height: 1.55;
        color: var(--color-text-primary);
    }
    .specimen-body p {
        margin: 0;
    }
    .broken-link {
        color: var(--color-text-link-broken);
        text-decoration: underline;
    }
    .specimen-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }
    .specimen-tags :global(.tag-pill) {
        font-size: 0.72rem;
    }
    .specimen-code {
        margin: 0;
        padding: 0.5rem 0.6rem;
        border-radius: 4px;
        background: var(--color-background-tertiary);
        font-family: var(--font-mono);
        font-size: 0.72rem;
        line-height: 1.5;
        overflow-x: auto;
    }
    .code-tag {
        color: var(--code-tag);
    }
    .code-attribute {
        color: var(--code-attribute);
    }
    .code-string {
        color: var(--code-string);
    }
    .code-punct {
        color: var(--color-text-secondary);
    }
    .specimen-error {
        color: var(--color-text-error);
        font-size: 0.75rem;
    }
    .specimen-caption {
        margin: 0;
        font-size: 0.72rem;
        font-style: italic;
        color: var(--color-text-secondary);
    }

    /* ---- Empty canvas ---- */
    .empty-canvas {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        align-self: center;
        text-align: center;
        margin: auto;
        max-width: 340px;
        color: var(--color-text-secondary);
    }
    .empty-canvas h4 {
        margin: 0;
        color: var(--color-text-heading);
        font-family: var(--font-family-heading);
        font-size: 1.35rem;
        border: none;
        padding: 0;
        line-height: 1.3;
    }
</style>
