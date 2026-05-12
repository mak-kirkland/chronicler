<script lang="ts">
    import { get } from "svelte/store";
    import { confirm } from "@tauri-apps/plugin-dialog";
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Select from "$lib/components/ui/Select.svelte";
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
        { value: "", label: "Default" },
        ...allAvailableFonts.map((f) => ({
            value: f.value,
            label: f.name,
        })),
    ]);

    // --- Constants ---
    const colorLabels: Record<string, string> = {
        // UI Colors
        "--color-background-primary": "Primary",
        "--color-background-secondary": "Secondary",
        "--color-background-tertiary": "Tertiary",
        "--color-text-heading": "Headings",
        "--color-text-primary": "Body",
        "--color-text-secondary": "Secondary",
        "--color-border-primary": "Borders",
        "--color-accent-primary": "Accent",
        "--color-icons": "Icons",
        "--color-text-link": "Links",
        "--color-text-link-broken": "Broken Links",
        "--color-text-error": "Errors",

        // Syntax Colors
        "--code-tag": "HTML Tags",
        "--code-attribute": "Attributes",
        "--code-string": "Strings",
    };

    // Visual grouping for the editor — purely presentational, the underlying
    // palette is still THEME_PALETTE_KEYS.
    const UI_SUBGROUPS: Array<{
        title: string;
        keys: ReadonlyArray<keyof ThemePalette>;
    }> = [
        {
            title: "Surfaces",
            keys: [
                "--color-background-primary",
                "--color-background-secondary",
                "--color-background-tertiary",
            ],
        },
        {
            title: "Ink",
            keys: [
                "--color-text-heading",
                "--color-text-primary",
                "--color-text-secondary",
            ],
        },
        {
            title: "Accents",
            keys: [
                "--color-border-primary",
                "--color-accent-primary",
                "--color-icons",
            ],
        },
        {
            title: "Signals",
            keys: [
                "--color-text-link",
                "--color-text-link-broken",
                "--color-text-error",
            ],
        },
    ];

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
            name: "My New Theme",
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
            name: uniqueThemeName(`${sourceName} Copy`),
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

    function handleSave() {
        const themeToSave = currentTheme;
        if (!themeToSave || !themeToSave.name.trim()) {
            // TODO: Using a custom modal or inline message is better than alert() in Tauri apps.
            alert("Theme name cannot be empty.");
            return;
        }

        const isRenaming = originalName && originalName !== themeToSave.name;
        const wasActive = get(activeTheme) === originalName;

        if (
            isRenaming &&
            $userThemes.some((t) => t.name === themeToSave.name)
        ) {
            alert("A theme with this name already exists.");
            return;
        }

        if (isRenaming) {
            deleteCustomTheme(originalName as ThemeName);
        }

        saveCustomTheme(themeToSave);
        originalName = themeToSave.name;

        if (isRenaming && wasActive) {
            setActiveTheme(themeToSave.name);
        }
    }

    async function handleDelete() {
        const themeToDelete = currentTheme;
        if (!themeToDelete) return;

        const message = `Are you sure you want to delete "${themeToDelete.name}"?`;
        if (
            await confirm(message, {
                title: "Confirm Deletion",
            })
        ) {
            deleteCustomTheme(themeToDelete.name);
            currentTheme = null;
            originalName = null;
        }
    }
</script>

<Modal title="Theme Editor" {onClose} wide>
    <div class="editor">
        <aside class="sidebar">
            <header class="sidebar-header">
                <span class="eyebrow">Library</span>
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
                    <p class="empty-list">No custom themes yet.</p>
                {/if}
            </div>

            <footer class="sidebar-actions">
                <Button onclick={createNewTheme}>+ New theme</Button>
                <Select
                    options={cloneOptions}
                    bind:value={cloneSourceName}
                    placeholder="Duplicate from…"
                    onSelect={handleCloneSelect}
                />
            </footer>
        </aside>

        <main class="canvas">
            {#if currentTheme}
                <header class="canvas-header">
                    <span class="eyebrow">
                        {originalName ? "Editing" : "New theme"}
                    </span>
                    <input
                        class="title-input"
                        type="text"
                        bind:value={currentTheme.name}
                        spellcheck="false"
                        aria-label="Theme name"
                    />
                </header>

                <section class="canvas-section">
                    <h5 class="section-title">Typography</h5>
                    <div class="font-row">
                        <div class="font-field">
                            <span class="field-label">Heading</span>
                            <Select
                                options={fontOptions}
                                bind:value={currentTheme.headingFont}
                            />
                        </div>
                        <div class="font-field">
                            <span class="field-label">Body</span>
                            <Select
                                options={fontOptions}
                                bind:value={currentTheme.bodyFont}
                            />
                        </div>
                    </div>
                </section>

                {#each UI_SUBGROUPS as group (group.title)}
                    <section class="canvas-section">
                        <h5 class="section-title">{group.title}</h5>
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

                <section class="canvas-section">
                    <h5 class="section-title">Code</h5>
                    <div class="swatch-grid">
                        {#each SYNTAX_PALETTE_KEYS as key (key)}
                            <div class="swatch">
                                <div
                                    class="swatch-chip"
                                    style:background={currentTheme.palette[key]}
                                >
                                    <input
                                        type="color"
                                        bind:value={currentTheme.palette[key]}
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
                                        bind:value={currentTheme.palette[key]}
                                        spellcheck="false"
                                    />
                                </div>
                            </div>
                        {/each}
                    </div>
                </section>

                <footer class="canvas-actions">
                    <Button type="button" onclick={handleSave}
                        >Save theme</Button
                    >
                    {#if originalName}
                        <Button type="button" onclick={handleDelete}
                            >Delete</Button
                        >
                    {/if}
                </footer>
            {:else}
                <div class="empty-canvas">
                    <span class="eyebrow">Theme Editor</span>
                    <h4>Pick a theme on the left, or start fresh.</h4>
                </div>
            {/if}
        </main>
    </div>
</Modal>

<style>
    .editor {
        display: grid;
        grid-template-columns: 260px 1fr;
        gap: 1.75rem;
        height: 65vh;
        min-height: 480px;
        max-height: 640px;
    }

    /* ---- Sidebar ---- */
    .sidebar {
        display: flex;
        flex-direction: column;
        border-right: 1px solid var(--color-border-primary);
        padding-right: 1.5rem;
        min-height: 0;
    }
    .sidebar-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-bottom: 0.75rem;
    }
    .eyebrow {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: var(--color-text-secondary);
        font-weight: 600;
    }
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
    .section-title {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.2em;
        color: var(--color-text-secondary);
        margin: 0;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--color-border-primary);
        font-weight: 600;
    }

    /* ---- Swatches ---- */
    .swatch-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 0.65rem;
    }
    .swatch {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        padding: 0.45rem 0.55rem;
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        background: var(--color-background-secondary);
        min-width: 0;
    }
    .swatch-chip {
        position: relative;
        width: 40px;
        height: 40px;
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
