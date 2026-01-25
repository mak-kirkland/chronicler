<script lang="ts">
    import { allFileTitles, allMaps } from "$lib/worldStore";
    import { writePageContent } from "$lib/commands";
    import { registerMap } from "$lib/mapStore";
    import Button from "./Button.svelte";
    import SearchableSelect from "./SearchableSelect.svelte";
    import Modal from "./Modal.svelte";
    import type { MapConfig, MapPin } from "$lib/mapModels";

    let { onClose, mapPath, mapConfig, x, y, existingPin } = $props<{
        onClose: () => void;
        mapPath: string;
        mapConfig: MapConfig;
        x?: number; // Optional if editing
        y?: number; // Optional if editing
        existingPin?: MapPin; // Optional pin to edit
    }>();

    // Initialize state with defaults or existing pin data
    let selectedPage = $state(existingPin?.targetPage || "");
    let selectedMap = $state(existingPin?.targetMap || "");
    let label = $state(existingPin?.label || "");
    let selectedIcon = $state(existingPin?.icon || "📍");
    let selectedColor = $state(existingPin?.color || "#3498db"); // Default blue
    let isInvisible = $state(existingPin?.invisible || false);
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

    // Auto-fill label when target is selected, only if adding new pin or label is empty
    $effect(() => {
        if (!label && !existingPin) {
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
            // Determine coordinates: use passed x/y (new pin) or keep existing (edit)
            const finalX = existingPin ? existingPin.x : Math.round(x || 0);
            const finalY = existingPin ? existingPin.y : Math.round(y || 0);

            const pinData: MapPin = {
                id: existingPin ? existingPin.id : crypto.randomUUID(),
                x: finalX,
                y: finalY,
                targetPage: selectedPage || undefined,
                targetMap: selectedMap || undefined,
                label: label || selectedPage || selectedMap || "Pin",
                icon: selectedIcon,
                color: selectedColor,
                invisible: isInvisible,
            };

            let updatedPins: MapPin[];

            if (existingPin) {
                // Update existing pin
                updatedPins = (mapConfig.pins || []).map((p) =>
                    p.id === existingPin.id ? pinData : p,
                );
            } else {
                // Add new pin
                updatedPins = [...(mapConfig.pins || []), pinData];
            }

            const updatedConfig = {
                ...mapConfig,
                pins: updatedPins,
            };

            await writePageContent(
                mapPath,
                JSON.stringify(updatedConfig, null, 2),
            );
            registerMap(mapPath, updatedConfig);

            onClose();
        } catch (e) {
            console.error("Failed to save pin:", e);
            alert("Failed to save pin.");
        } finally {
            isSaving = false;
        }
    }
</script>

<Modal title={existingPin ? "Edit Pin" : "Add Pin"} {onClose}>
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
            <label class="checkbox-wrapper">
                <input type="checkbox" bind:checked={isInvisible} />
                <span>Invisible Pin (Ghost)</span>
            </label>
            <p class="help-text">
                Invisible pins are hidden on the map unless the Map Console is
                open. Useful for adding interactivity to pre-drawn map features.
            </p>
        </div>

        <div class="form-group" class:disabled={isInvisible}>
            <label>Icon {isInvisible ? "(Hidden)" : ""}</label>
            <div class="icon-grid">
                {#each ICONS as icon}
                    <button
                        type="button"
                        class="icon-btn"
                        class:selected={selectedIcon === icon}
                        onclick={() => (selectedIcon = icon)}
                        title="Select icon"
                        disabled={isInvisible}
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

        {#if !existingPin}
            <div class="coordinates">
                Coordinates: {Math.round(x || 0)}, {Math.round(y || 0)}
            </div>
        {/if}

        <div class="modal-actions">
            <Button type="button" variant="ghost" onclick={onClose}
                >Cancel</Button
            >
            <Button
                type="submit"
                disabled={(!selectedPage && !selectedMap && !label) || isSaving}
            >
                {isSaving
                    ? "Saving..."
                    : existingPin
                      ? "Save Changes"
                      : "Add Pin"}
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
    .form-group.disabled {
        opacity: 0.5;
        pointer-events: none;
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

    /* Checkbox Styles */
    .checkbox-wrapper {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        font-weight: normal;
        color: var(--color-text-primary);
    }
    .checkbox-wrapper input[type="checkbox"] {
        width: 1.2rem;
        height: 1.2rem;
        cursor: pointer;
    }
    .help-text {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text-secondary);
        font-style: italic;
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
