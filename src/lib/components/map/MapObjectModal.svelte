<script lang="ts">
    import { allFileTitles, allMaps } from "$lib/worldStore";
    import { updateMapConfig } from "$lib/mapStore";
    import {
        ICONS,
        PALETTE,
        DEFAULT_SHAPE_COLOR,
        DEFAULT_PIN_ICON,
    } from "$lib/mapUtils";
    import Button from "$lib/components/ui/Button.svelte";
    import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
    import Modal from "$lib/components/modals/Modal.svelte";
    import type { MapConfig, MapPin, MapRegion } from "$lib/mapModels";

    let { onClose, mapPath, mapConfig, mode, initialData } = $props<{
        onClose: () => void;
        mapPath: string;
        mapConfig: MapConfig;
        mode: "pin" | "region";
        initialData: {
            id?: string;
            // Pin specific
            x?: number;
            y?: number;
            icon?: string;
            invisible?: boolean;
            // Region specific
            shapeData?: any; // geometry data
            // Shared
            layerId?: string;
            targetPage?: string;
            targetMap?: string;
            label?: string;
            color?: string;
        };
    }>();

    const isEditing = !!initialData.id;
    const title = `${isEditing ? "Edit" : "Add"} ${mode === "pin" ? "Pin" : "Region"}`;

    // Initialize state
    let selectedPage = $state(initialData.targetPage || "");
    let selectedMap = $state(initialData.targetMap || "");
    let label = $state(initialData.label || "");
    let selectedColor = $state(initialData.color || DEFAULT_SHAPE_COLOR);
    let selectedLayerId = $state(initialData.layerId || "");

    // Pin-specific state
    let selectedIcon = $state(initialData.icon || DEFAULT_PIN_ICON);
    let isInvisible = $state(initialData.invisible || false);

    let isSaving = $state(false);

    // Options derived from stores
    const pageOptions = $derived($allFileTitles);
    const mapOptions = $derived($allMaps.map((m) => m.title));

    // Layer options
    const layerOptions = $derived([
        { id: "", name: "All Layers (Always Visible)" },
        ...(mapConfig.layers || []).map((l) => ({ id: l.id, name: l.name })),
    ]);

    // Auto-fill label when target is selected, only if adding new object and label is empty
    $effect(() => {
        if (!isEditing) {
            if (selectedPage) label = selectedPage;
            else if (selectedMap) label = selectedMap;
        }
    });

    async function handleSave() {
        if (isSaving) return;
        isSaving = true;

        try {
            await updateMapConfig(mapPath, (currentConfig) => {
                const updatedPins = [...(currentConfig.pins || [])];
                const updatedShapes = [...(currentConfig.shapes || [])];

                const commonData = {
                    targetPage: selectedPage || undefined,
                    targetMap: selectedMap || undefined,
                    label: label || undefined,
                    color: selectedColor,
                    layerId: selectedLayerId || undefined,
                };

                if (mode === "pin") {
                    const pinData: MapPin = {
                        id: initialData.id || crypto.randomUUID(),
                        x: initialData.x!, // x/y are required for pins
                        y: initialData.y!,
                        ...commonData,
                        icon: selectedIcon,
                        invisible: isInvisible,
                    };

                    if (isEditing) {
                        const index = updatedPins.findIndex(
                            (p) => p.id === pinData.id,
                        );
                        if (index !== -1) updatedPins[index] = pinData;
                    } else {
                        updatedPins.push(pinData);
                    }
                } else {
                    // Region mode
                    let regionData: MapRegion;

                    if (isEditing) {
                        regionData = {
                            ...(initialData as MapRegion),
                            ...commonData,
                            id: initialData.id!,
                        };
                        const index = updatedShapes.findIndex(
                            (s) => s.id === regionData.id,
                        );
                        if (index !== -1) updatedShapes[index] = regionData;
                    } else {
                        regionData = {
                            id: crypto.randomUUID(),
                            ...initialData.shapeData,
                            ...commonData,
                        };
                        updatedShapes.push(regionData);
                    }
                }

                return {
                    ...currentConfig,
                    pins: updatedPins,
                    shapes: updatedShapes,
                };
            });

            onClose();
        } catch (e) {
            console.error(e);
            alert("Failed to save map object.");
        } finally {
            isSaving = false;
        }
    }
</script>

<Modal {title} {onClose}>
    <form
        class="form"
        onsubmit={(e) => {
            e.preventDefault();
            handleSave();
        }}
    >
        <!-- Link to Page -->
        <div class="form-group">
            <label for="page-select">Link to Page</label>
            <SearchableSelect
                id="page-select"
                options={pageOptions}
                placeholder="Search pages..."
                bind:value={selectedPage}
            />
        </div>

        <!-- Link to Map -->
        <div class="form-group">
            <label for="map-select">Link to Map</label>
            <SearchableSelect
                id="map-select"
                options={mapOptions}
                placeholder="Search maps..."
                bind:value={selectedMap}
            />
        </div>

        <!-- Layer Select -->
        <div class="form-group">
            <label for="layer-select">Assign to Layer</label>
            <select id="layer-select" bind:value={selectedLayerId}>
                {#each layerOptions as option}
                    <option value={option.id}>{option.name}</option>
                {/each}
            </select>
            <p class="help-text">
                Objects assigned to a specific layer will hide if that layer is
                hidden.
            </p>
        </div>

        <!-- Label -->
        <div class="form-group">
            <label for="pin-label">Label (Optional)</label>
            <input
                type="text"
                id="pin-label"
                bind:value={label}
                placeholder={mode === "pin" ? "Pin Label" : "Region Label"}
            />
        </div>

        <!-- Icon Picker (Pins Only) -->
        {#if mode === "pin"}
            <div class="form-group">
                <label for="icon-select">Icon</label>
                <div class="icon-grid">
                    {#each ICONS as icon}
                        <button
                            type="button"
                            class="icon-btn"
                            class:selected={selectedIcon === icon}
                            onclick={() => (selectedIcon = icon)}
                        >
                            {icon}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Color Picker -->
        <div class="form-group">
            <label for="color-select">Color</label>
            <div class="color-picker-row">
                <div class="color-grid">
                    {#each PALETTE as color}
                        <button
                            type="button"
                            class="color-swatch"
                            style="background-color: {color};"
                            class:selected={selectedColor === color}
                            onclick={() => (selectedColor = color)}
                            aria-label="Select color {color}"
                        ></button>
                    {/each}
                </div>
                <input
                    type="color"
                    bind:value={selectedColor}
                    class="color-input"
                    title="Custom Color"
                />
            </div>
        </div>

        <!-- Invisible Toggle (Pins Only) -->
        {#if mode === "pin"}
            <div class="form-group checkbox-group">
                <label class="checkbox-label">
                    <input type="checkbox" bind:checked={isInvisible} />
                    <span>Invisible Pin</span>
                </label>
                <p class="help-text">
                    Invisible pins are only shown when the Map Console is open.
                </p>
            </div>
        {/if}

        <!-- Actions -->
        <div class="modal-actions">
            <Button type="button" variant="ghost" onclick={onClose}
                >Cancel</Button
            >
            <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
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
        font-size: 0.9rem;
    }
    input[type="text"],
    select {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 1rem;
        box-sizing: border-box;
    }
    input[type="text"]:focus,
    select:focus {
        outline: 1px solid var(--color-accent-primary);
        border-color: var(--color-accent-primary);
    }

    /* Icon Grid */
    .icon-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        max-height: 150px;
        overflow-y: auto;
        padding: 0.5rem;
        border: 1px solid var(--color-border-subtle);
        border-radius: 6px;
        background: var(--color-background-secondary);
    }
    .icon-btn {
        background: none;
        border: 1px solid transparent;
        border-radius: 4px;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.25rem;
        transition: transform 0.1s;
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

    /* Checkbox Styles */
    .checkbox-group {
        gap: 0.25rem;
    }
    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-weight: normal;
        cursor: pointer;
        color: var(--color-text-primary);
    }
    .checkbox-label input[type="checkbox"] {
        width: 1.1em;
        height: 1.1em;
        accent-color: var(--color-accent-primary);
    }
    .help-text {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-text-secondary);
        font-style: italic;
    }

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        margin-top: 1rem;
    }
</style>
