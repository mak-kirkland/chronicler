<script lang="ts">
    import { allImageFiles, imagePathLookup } from "$lib/worldStore";
    import { updateMapConfig } from "$lib/mapStore";
    import {
        resizeMapData,
        detectImageDimensions,
        analyzeMapImageChange,
    } from "$lib/mapUtils";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import Button from "./Button.svelte";
    import SearchableSelect from "./SearchableSelect.svelte";
    import Icon from "./Icon.svelte";
    import Modal from "./Modal.svelte";
    import type { MapConfig, MapLayer } from "$lib/mapModels";

    let { onClose, mapPath, mapConfig } = $props<{
        onClose: () => void;
        mapPath: string;
        mapConfig: MapConfig;
    }>();

    // Deep clone initial layers to local state for editing
    let layers = $state<MapLayer[]>(
        JSON.parse(JSON.stringify(mapConfig.layers || [])),
    );
    let isSaving = $state(false);

    // Validation state
    let warning = $state<string | null>(null);
    let scaleFactor = $state(1);
    let newDimensions = $state<{ width: number; height: number } | null>(null);

    function addLayer() {
        const id = crypto.randomUUID();
        // Add to top (highest zIndex)
        layers = [
            {
                id,
                name: "New Layer",
                image: "",
                opacity: 1,
                zIndex: layers.length,
                visible: true,
            },
            ...layers,
        ];
        recalcZIndices();
    }

    function removeLayer(index: number) {
        if (layers.length <= 1) {
            alert("Map must have at least one layer.");
            return;
        }
        layers.splice(index, 1);
        layers = [...layers]; // Trigger reactivity
        recalcZIndices();
    }

    function moveLayer(index: number, direction: "up" | "down") {
        if (direction === "up" && index > 0) {
            [layers[index], layers[index - 1]] = [
                layers[index - 1],
                layers[index],
            ];
        } else if (direction === "down" && index < layers.length - 1) {
            [layers[index], layers[index + 1]] = [
                layers[index + 1],
                layers[index],
            ];
        }
        layers = [...layers];
        recalcZIndices();
    }

    // Assign z-index based on list order (Top of list = Highest zIndex)
    function recalcZIndices() {
        layers = layers.map((l, i) => ({
            ...l,
            zIndex: layers.length - 1 - i,
        }));
    }

    // Check dimensions when base layer image changes
    async function checkDimensions(imageName: string) {
        if (!imageName) return;

        const fullPath = $imagePathLookup.get(imageName.toLowerCase());
        if (!fullPath) return;

        try {
            const src = convertFileSrc(fullPath);
            const dims = await detectImageDimensions(src);

            const result = analyzeMapImageChange(
                dims.width,
                dims.height,
                mapConfig.width,
                mapConfig.height,
            );

            scaleFactor = result.scaleFactor;
            warning = result.warning;

            if (scaleFactor !== 1) {
                newDimensions = dims;
            } else {
                newDimensions = null;
            }
        } catch (e) {
            console.error("Failed to detect dimensions", e);
            warning = "Could not load image to verify dimensions.";
        }
    }

    async function handleSave() {
        if (isSaving) return;

        // Basic Validation
        if (layers.some((l) => !l.image)) {
            alert("All layers must have an image selected.");
            return;
        }

        isSaving = true;

        try {
            // Check if base layer (bottom-most) changed dimensions
            const baseLayer = layers[layers.length - 1];
            const originalBase =
                mapConfig.layers.find((l) => l.id === "base") ||
                mapConfig.layers[0];

            if (baseLayer.image !== originalBase.image) {
                await checkDimensions(baseLayer.image);
            }

            await updateMapConfig(mapPath, (currentConfig) => {
                let finalConfig = {
                    ...currentConfig,
                    layers: layers,
                };

                // If dimensions changed, run the resize utility
                if (newDimensions && scaleFactor !== 1) {
                    finalConfig = resizeMapData(
                        finalConfig,
                        scaleFactor,
                        newDimensions.width,
                        newDimensions.height,
                    );
                }

                return finalConfig;
            });
            onClose();
        } catch (e) {
            console.error(e);
            alert("Failed to save map settings.");
        } finally {
            isSaving = false;
        }
    }
</script>

<Modal title="Map Layers & Settings" {onClose}>
    <div class="settings-container">
        <div class="layer-manager">
            <div class="header-row">
                <h3>Layers</h3>
                <Button size="small" onclick={addLayer}>+ Add Layer</Button>
            </div>

            <div class="layer-list">
                {#each layers as layer, i}
                    <!-- Using shared global Sortable Card pattern from app.css -->
                    <div class="sortable-card">
                        <div class="sortable-handle">
                            <button
                                class="icon-btn"
                                onclick={() => moveLayer(i, "up")}
                                disabled={i === 0}
                                title="Move Up">▲</button
                            >
                            <button
                                class="icon-btn"
                                onclick={() => moveLayer(i, "down")}
                                disabled={i === layers.length - 1}
                                title="Move Down">▼</button
                            >
                        </div>

                        <div class="sortable-content">
                            <div class="layer-row-content">
                                <div class="layer-details">
                                    <input
                                        type="text"
                                        class="layer-name-input"
                                        bind:value={layer.name}
                                        placeholder="Layer Name"
                                    />
                                    <div class="image-select-wrapper">
                                        <SearchableSelect
                                            id="layer-img-{i}"
                                            options={$allImageFiles}
                                            bind:value={layer.image}
                                            placeholder="Select Image..."
                                        />
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    class="icon-btn danger"
                                    title="Delete Layer"
                                    onclick={() => removeLayer(i)}
                                >
                                    <Icon type="close" />
                                </button>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        {#if warning}
            <div class="warning-box">{warning}</div>
        {/if}

        <div class="modal-actions">
            <Button type="button" variant="ghost" onclick={onClose}
                >Cancel</Button
            >
            <Button type="submit" onclick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
            </Button>
        </div>
    </div>
</Modal>

<style>
    .settings-container {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        min-width: 450px;
    }

    .header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
    }

    h3 {
        margin: 0;
        font-size: 1.1rem;
        color: var(--color-text-heading);
    }

    .layer-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-height: 400px;
        overflow-y: auto;
        padding-right: 0.5rem;
    }

    .layer-row-content {
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
    }

    .layer-details {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .layer-name-input {
        width: 100%;
        padding: 0.25rem 0.5rem;
        border: 1px solid var(--color-border-primary);
        background: var(--color-background-primary);
        color: var(--color-text-primary);
        border-radius: 4px;
        font-weight: bold;
    }

    /* Ensure input matches the style of the sortable card text */
    .layer-name-input:focus {
        outline: none;
        border-color: var(--color-accent-primary);
    }

    .image-select-wrapper {
        width: 100%;
    }

    .warning-box {
        color: var(--color-text-primary);
        background: var(--color-background-tertiary);
        padding: 0.75rem;
        border-radius: 4px;
        font-size: 0.9rem;
        border: 1px solid var(--color-border-primary);
    }

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
        border-top: 1px solid var(--color-border-subtle);
        padding-top: 1rem;
    }
</style>
