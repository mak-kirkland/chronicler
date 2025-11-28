<script lang="ts">
    import { get } from "svelte/store";
    import { confirm } from "@tauri-apps/plugin-dialog";
    import Modal from "./Modal.svelte";
    import Button from "./Button.svelte";
    import {
        activeTheme,
        userThemes,
        setActiveTheme,
        saveCustomTheme,
        deleteCustomTheme,
        forceThemeRefresh,
        THEME_PALETTE_KEYS,
        UI_PALETTE_KEYS,
        SYNTAX_PALETTE_KEYS,
        type CustomTheme,
        type ThemePalette,
        type ThemeName,
    } from "$lib/settingsStore";

    let { onClose } = $props<{ onClose: () => void }>();

    // --- State ---
    let currentTheme: CustomTheme | null = $state(null);
    let originalName: ThemeName | null = $state(null);

    // --- Constants ---
    const colorLabels: Record<string, string> = {
        // UI Colors
        "--color-background-primary": "Primary Background",
        "--color-background-secondary": "Secondary Background",
        "--color-background-tertiary": "Tertiary Background",
        "--color-text-heading": "Header Text",
        "--color-text-primary": "Primary Text",
        "--color-text-secondary": "Secondary Text",
        "--color-border-primary": "Borders",
        "--color-accent-primary": "Accent",
        "--color-text-link": "Links",
        "--color-text-link-broken": "Broken Links",
        "--color-text-error": "Errors",

        // Syntax Colors
        "--code-tag": "HTML Tags",
        "--code-attribute": "Attributes (class=)",
        "--code-string": "Strings",
    };

    const defaultPalette: ThemePalette = {
        // UI Defaults
        "--color-background-primary": "#fdf6e3",
        "--color-background-secondary": "#e6dcc9",
        "--color-background-tertiary": "#dcd3c3",
        "--color-text-heading": "#6a5f55",
        "--color-text-primary": "#4a3f35",
        "--color-text-secondary": "#6a5f55",
        "--color-border-primary": "#d3c7b3",
        "--color-accent-primary": "#dcd3c3",
        "--color-text-link": "#2563eb",
        "--color-text-link-broken": "#b04a4a",
        "--color-text-error": "#8b0000",

        // Syntax Defaults (Parchment)
        "--code-tag": "#b58900",
        "--code-attribute": "#268bd2",
        "--code-string": "#2aa198",
    };

    // --- Helper Functions ---
    /** Removes only the styles applied by the live preview. */
    function clearLivePreviewStyles() {
        for (const key of THEME_PALETTE_KEYS) {
            document.documentElement.style.removeProperty(key);
        }
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
            // Apply colors
            for (const [key, value] of Object.entries(currentTheme.palette)) {
                document.documentElement.style.setProperty(
                    key,
                    value as string,
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
        };
        originalName = null;
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

<Modal title="Theme Editor" {onClose}>
    <div class="theme-editor-container">
        <aside class="theme-list-panel">
            <h4>Custom Themes</h4>
            {#if $userThemes.length > 0}
                <ul class="theme-list">
                    {#each $userThemes as theme (theme.name)}
                        <li>
                            <button
                                class="theme-item"
                                class:active={currentTheme?.name === theme.name}
                                onclick={() => editTheme(theme)}
                            >
                                {theme.name}
                            </button>
                        </li>
                    {/each}
                </ul>
            {:else}
                <p class="no-themes-message">No custom themes yet.</p>
            {/if}
            <Button onclick={createNewTheme}>+ Create New Theme</Button>
        </aside>
        <main class="theme-form-panel">
            {#if currentTheme}
                <div class="form-group">
                    <label for="theme-name">Theme Name</label>
                    <input
                        id="theme-name"
                        type="text"
                        bind:value={currentTheme.name}
                    />
                </div>

                <h4>UI Colors</h4>
                <div class="color-grid">
                    {#each UI_PALETTE_KEYS as paletteKey (paletteKey)}
                        <div class="form-group color-picker-group">
                            <label for="color-{paletteKey}"
                                >{colorLabels[paletteKey] || paletteKey}</label
                            >
                            <div class="color-input-wrapper">
                                <input
                                    id="color-{paletteKey}"
                                    type="color"
                                    bind:value={
                                        currentTheme.palette[paletteKey]
                                    }
                                />
                                <span>{currentTheme.palette[paletteKey]}</span>
                            </div>
                        </div>
                    {/each}
                </div>

                <h4>Syntax Highlighting</h4>
                <div class="color-grid">
                    {#each SYNTAX_PALETTE_KEYS as paletteKey (paletteKey)}
                        <div class="form-group color-picker-group">
                            <label for="color-{paletteKey}"
                                >{colorLabels[paletteKey] || paletteKey}</label
                            >
                            <div class="color-input-wrapper">
                                <input
                                    id="color-{paletteKey}"
                                    type="color"
                                    bind:value={
                                        currentTheme.palette[paletteKey]
                                    }
                                />
                                <span>{currentTheme.palette[paletteKey]}</span>
                            </div>
                        </div>
                    {/each}
                </div>

                <div class="form-actions">
                    <Button type="button" onclick={handleSave}
                        >Save Theme</Button
                    >
                    <Button type="button" onclick={handleDelete}>Delete</Button>
                </div>
            {:else}
                <div class="placeholder">
                    <p>Select a theme to edit, or create a new one.</p>
                </div>
            {/if}
        </main>
    </div>
</Modal>

<style>
    .theme-editor-container {
        display: flex;
        gap: 2rem;
        /* Set a max-height relative to the viewport and a min-height */
        max-height: 70vh;
        min-height: 450px;
    }
    .theme-list-panel {
        flex: 0 0 200px;
        border-right: 1px solid var(--color-border-primary);
        padding-right: 2rem;
        display: flex;
        flex-direction: column;
    }
    .theme-list {
        list-style: none;
        padding: 0;
        margin: 0 0 1rem 0;
        flex-grow: 1;
    }
    .theme-item {
        width: 100%;
        background: none;
        border: none;
        color: var(--color-text-link);
        text-align: left;
        padding: 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
    }
    .theme-item:hover {
        background-color: var(--color-background-secondary);
    }
    .theme-item.active {
        background-color: var(--color-accent-primary);
        color: var(--color-text-primary);
        font-weight: bold;
    }
    .no-themes-message {
        font-style: italic;
        color: var(--color-text-secondary);
        padding: 1rem 0.5rem;
        flex-grow: 1;
    }
    .theme-form-panel {
        flex: 1;
        /* Allow this panel to scroll vertically */
        overflow-y: auto;
        /* Add some padding to the right to make space for the scrollbar */
        padding-right: 1rem;
        /* A crucial property for flexbox children to scroll correctly */
        min-height: 0;
    }
    .form-group {
        margin-bottom: 1rem;
    }
    .form-group label {
        display: block;
        margin-bottom: 0.5rem;
        color: var(--color-text-secondary);
    }
    .form-group input[type="text"] {
        width: 100%;
        padding: 0.5rem;
        font-size: 1rem;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
        border-radius: 4px;
        box-sizing: border-box;
    }
    .color-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
        padding-bottom: 1rem;
    }
    .color-input-wrapper {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .color-input-wrapper input[type="color"] {
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        width: 40px;
        height: 40px;
        background-color: transparent;
        border: 1px solid var(--color-border-primary);
        padding: 0;
        border-radius: 4px;
        cursor: pointer;
    }
    /* Hides the default color picker UI for a custom look */
    .color-input-wrapper input[type="color"]::-webkit-color-swatch-wrapper {
        padding: 0;
    }
    .color-input-wrapper input[type="color"]::-webkit-color-swatch {
        border: none;
        border-radius: 4px;
    }
    .form-actions {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--color-border-primary);
        display: flex;
        gap: 0.5rem;
        position: sticky;
        bottom: 0;
        background-color: var(--color-background-primary);
    }
    .placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--color-text-secondary);
        font-style: italic;
    }

    h4 {
        margin-top: 1rem;
        margin-bottom: 0.5rem;
        padding-bottom: 0.25rem;
        border-bottom: 1px solid var(--color-border-primary);
    }
</style>
