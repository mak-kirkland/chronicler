<script lang="ts">
    import { allFileTitles, allMaps } from "$lib/worldStore";
    import { writePageContent } from "$lib/commands";
    import { registerMap } from "$lib/mapStore";
    import Button from "./Button.svelte";
    import SearchableSelect from "./SearchableSelect.svelte";
    import Modal from "./Modal.svelte";
    import type { MapConfig, MapPin } from "$lib/mapModels";

    let { onClose, mapPath, mapConfig, x, y } = $props<{
        onClose: () => void;
        mapPath: string;
        mapConfig: MapConfig;
        x: number;
        y: number;
    }>();

    let selectedPage = $state("");
    let selectedMap = $state("");
    let label = $state("");
    let selectedIcon = $state("📍");
    let selectedColor = $state("#3498db"); // Default blue
    let isSaving = $state(false);

    // Options derived from stores
    const pageOptions = $derived($allFileTitles);
    const mapOptions = $derived($allMaps.map((m) => m.title));

    const ICONS = [
        "📍",

        // Settlements & structures
        "🏰",
        "🏯",
        "🏠",
        "🛖",
        "⛪",
        "🛕",

        // Natural features
        "🌲",
        "🌳",
        "⛰️",
        "🏔️",
        "🏜️",
        "🏞️",
        "🌊",
        "🏝️",
        "🌋",
        "❄️",
        "⚡",

        // Travel & trade
        "⚓",
        "⛵",

        // Conflict & danger
        "⚔️",
        "🛡️",
        "💀",
        "☠️",
        "🪦",
        "🔥",

        // Magic & mystery
        "✨",
        "🔮",
        "🌀",
        "📜",
        "🕯️",

        // Factions & control
        "👑",
        "🚩",
        "🏳️",
        "⚖️",
        "🔒",
        "🔓",

        // Objects & rewards
        "💰",
        "💎",
        "🔑",

        // Knowledge
        "👁️",
        "🧠",
        "⏳",
        "🔔",

        // Generic markers
        "⭐",
        "🔖",
        "❌",
        "❓",
        "❗",
    ];

    const PRESET_COLORS = [
        "#3498db", // Blue (Default)
        "#e74c3c", // Red
        "#ffffff", // White
        "#f1c40f", // Yellow
        "#2ecc71", // Green
        "#9b59b6", // Purple
        "#34495e", // Dark Blue/Grey
        "#95a5a6", // Grey
        "#e67e22", // Orange
        "#1abc9c", // Teal
    ];

    // Auto-fill label when target is selected
    $effect(() => {
        if (!label) {
            if (selectedPage) label = selectedPage;
            else if (selectedMap) label = selectedMap;
        }
    });

    async function handleSubmit(event?: Event) {
        if (event) event.preventDefault();
        // Require at least one link or a label to be set
        if (!selectedPage && !selectedMap && !label) return;

        isSaving = true;
        try {
            const newPin: MapPin & { icon?: string; color?: string } = {
                id: crypto.randomUUID(),
                x: Math.round(x),
                y: Math.round(y),
                // Allow both targets to be set
                targetPage: selectedPage || undefined,
                targetMap: selectedMap || undefined,
                label: label || selectedPage || selectedMap || "Pin",
                icon: selectedIcon,
                color: selectedColor,
            };

            const updatedConfig = {
                ...mapConfig,
                pins: [...(mapConfig.pins || []), newPin],
            };

            await writePageContent(
                mapPath,
                JSON.stringify(updatedConfig, null, 2),
            );
            registerMap(mapPath, updatedConfig);

            onClose();
        } catch (e) {
            console.error("Failed to add pin:", e);
            alert("Failed to save pin.");
        } finally {
            isSaving = false;
        }
    }
</script>

<Modal title="Add Pin" {onClose}>
    <form onsubmit={handleSubmit} class="form">
        <div class="form-group">
            <label>Linked Page (Optional)</label>
            <SearchableSelect
                options={pageOptions}
                bind:value={selectedPage}
                placeholder="Search pages..."
            />
        </div>

        <div class="form-group">
            <label>Linked Map (Optional)</label>
            <SearchableSelect
                options={mapOptions}
                bind:value={selectedMap}
                placeholder="Search maps..."
            />
        </div>

        <div class="form-group">
            <label for="pin-label">Label (Optional)</label>
            <input
                id="pin-label"
                type="text"
                bind:value={label}
                placeholder="Pin Label"
            />
        </div>

        <div class="form-group">
            <label>Icon</label>
            <div class="icon-grid">
                {#each ICONS as icon}
                    <button
                        type="button"
                        class="icon-btn"
                        class:selected={selectedIcon === icon}
                        onclick={() => (selectedIcon = icon)}
                        title="Select icon"
                    >
                        {icon}
                    </button>
                {/each}
            </div>
        </div>

        <div class="form-group">
            <label>Pin Color</label>
            <div class="color-picker-row">
                <div class="color-grid">
                    {#each PRESET_COLORS as color}
                        <button
                            type="button"
                            class="color-swatch"
                            class:selected={selectedColor === color}
                            style="background-color: {color};"
                            onclick={() => (selectedColor = color)}
                            title={color}
                        ></button>
                    {/each}
                </div>
                <!-- Native color picker for custom colors -->
                <input
                    type="color"
                    class="color-input"
                    bind:value={selectedColor}
                    title="Custom Color"
                />
            </div>
        </div>

        <div class="coordinates">
            Coordinates: {Math.round(x)}, {Math.round(y)}
        </div>

        <div class="modal-actions">
            <Button type="button" variant="ghost" onclick={onClose}
                >Cancel</Button
            >
            <Button
                type="submit"
                disabled={(!selectedPage && !selectedMap && !label) || isSaving}
            >
                {isSaving ? "Saving..." : "Add Pin"}
            </Button>
        </div>
    </form>
</Modal>

<style>
    .form {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    label {
        font-weight: bold;
        color: var(--color-text-secondary);
    }
    input[type="text"] {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 1rem;
        box-sizing: border-box;
    }
    input[type="text"]:focus {
        outline: 1px solid var(--color-accent-primary);
        border-color: var(--color-accent-primary);
    }

    /* Icon Grid Styles */
    .icon-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
        gap: 0.5rem;
        padding: 0.5rem;
        background: var(--color-background-secondary);
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        max-height: 150px;
        overflow-y: auto;
    }
    .icon-btn {
        font-size: 1.5rem;
        background: none;
        border: 2px solid transparent;
        border-radius: 4px;
        cursor: pointer;
        padding: 0.2rem;
        line-height: 1;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .icon-btn:hover {
        background-color: var(--color-background-tertiary);
        transform: scale(1.1);
    }
    .icon-btn.selected {
        background-color: var(--color-background-primary);
        border-color: var(--color-accent-primary);
        box-shadow: 0 0 5px var(--color-overlay-subtle);
    }

    /* Color Picker Styles */
    .color-picker-row {
        display: flex;
        gap: 1rem;
        align-items: center;
    }
    .color-grid {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
    .color-swatch {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        transition: transform 0.1s;
        padding: 0;
    }
    .color-swatch:hover {
        transform: scale(1.1);
        border-color: var(--color-border-primary);
    }
    .color-swatch.selected {
        border-color: var(--color-text-primary);
        box-shadow:
            0 0 0 2px var(--color-background-primary),
            0 0 0 4px var(--color-text-primary);
    }
    .color-input {
        width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        border-radius: 4px;
        background: none;
        cursor: pointer;
    }

    .coordinates {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        font-family: var(--font-mono);
        text-align: right;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
    }
</style>
