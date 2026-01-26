<script lang="ts">
    import { allFileTitles, allMaps } from "$lib/worldStore";
    import { writePageContent } from "$lib/commands";
    import { registerMap } from "$lib/mapStore";
    import Button from "./Button.svelte";
    import SearchableSelect from "./SearchableSelect.svelte";
    import Modal from "./Modal.svelte";
    import type { MapConfig, MapRegion } from "$lib/mapModels";

    let { onClose, mapPath, mapConfig, shapeData, existingRegion } = $props<{
        onClose: () => void;
        mapPath: string;
        mapConfig: MapConfig;
        shapeData?: {
            type: "polygon" | "circle";
            points?: { x: number; y: number }[];
            x?: number;
            y?: number;
            radius?: number;
        };
        existingRegion?: MapRegion;
    }>();

    // Initialize state with defaults or existing region data
    let selectedPage = $state(existingRegion?.targetPage || "");
    let selectedMap = $state(existingRegion?.targetMap || "");
    let label = $state(existingRegion?.label || "");
    let selectedColor = $state(existingRegion?.color || "#3498db"); // Default blue
    let isSaving = $state(false);

    // Options derived from stores
    const pageOptions = $derived($allFileTitles);
    const mapOptions = $derived($allMaps.map((m) => m.title));

    const PRESET_COLORS = [
        "#3498db", // Blue
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

    // Auto-fill label when target is selected, only if adding new region or label is empty
    $effect(() => {
        if (!label && !existingRegion) {
            if (selectedPage) label = selectedPage;
            else if (selectedMap) label = selectedMap;
        }
    });

    async function handleSubmit(event?: Event) {
        if (event) event.preventDefault();

        // If creating new: we need shapeData. If editing: we use existingRegion.
        if (!existingRegion && !shapeData) {
            console.error("No shape data provided for new region.");
            return;
        }

        isSaving = true;
        try {
            let updatedShapes: MapRegion[];

            if (existingRegion) {
                // --- UPDATE EXISTING ---
                const updatedRegion: MapRegion = {
                    ...existingRegion,
                    targetPage: selectedPage || undefined,
                    targetMap: selectedMap || undefined,
                    label: label || selectedPage || selectedMap || "Region",
                    color: selectedColor,
                };

                updatedShapes = (mapConfig.shapes || []).map((s) =>
                    s.id === existingRegion.id ? updatedRegion : s,
                );
            } else if (shapeData) {
                // --- CREATE NEW ---
                const newId = crypto.randomUUID();
                let newRegion: MapRegion;

                if (shapeData.type === "polygon") {
                    newRegion = {
                        id: newId,
                        type: "polygon",
                        points: shapeData.points || [],
                        targetPage: selectedPage || undefined,
                        targetMap: selectedMap || undefined,
                        label: label || selectedPage || selectedMap || "Region",
                        color: selectedColor,
                    };
                } else {
                    newRegion = {
                        id: newId,
                        type: "circle",
                        x: shapeData.x || 0,
                        y: shapeData.y || 0,
                        radius: shapeData.radius || 10,
                        targetPage: selectedPage || undefined,
                        targetMap: selectedMap || undefined,
                        label: label || selectedPage || selectedMap || "Region",
                        color: selectedColor,
                    };
                }

                updatedShapes = [...(mapConfig.shapes || []), newRegion];
            } else {
                return; // Should be unreachable given check above
            }

            const updatedConfig = {
                ...mapConfig,
                shapes: updatedShapes,
            };

            await writePageContent(
                mapPath,
                JSON.stringify(updatedConfig, null, 2),
            );
            registerMap(mapPath, updatedConfig);

            onClose();
        } catch (e) {
            console.error("Failed to save region:", e);
            alert("Failed to save region.");
        } finally {
            isSaving = false;
        }
    }
</script>

<Modal title={existingRegion ? "Edit Region" : "Add Region"} {onClose}>
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
            <label for="region-label">Label (Optional)</label>
            <input
                id="region-label"
                type="text"
                bind:value={label}
                placeholder="Region Label"
            />
        </div>

        <div class="form-group">
            <label>Region Color</label>
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
                <!-- Native color picker -->
                <input
                    type="color"
                    class="color-input"
                    bind:value={selectedColor}
                    title="Custom Color"
                />
            </div>
        </div>

        <div class="modal-actions">
            <Button type="button" variant="ghost" onclick={onClose}
                >Cancel</Button
            >
            <Button type="submit" disabled={isSaving}>
                {isSaving
                    ? "Saving..."
                    : existingRegion
                      ? "Save Changes"
                      : "Add Region"}
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

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
    }
</style>
