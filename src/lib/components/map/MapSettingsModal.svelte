<script lang="ts">
    import { allImageFiles, imagePathLookup } from "$lib/worldStore";
    import { updateMapConfig } from "$lib/mapStore";
    import { resizeMapData, checkLayerImage } from "$lib/mapUtils";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import Button from "$lib/components/ui/Button.svelte";
    import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
    import Icon from "$lib/components/ui/Icon.svelte";
    import ErrorBox from "$lib/components/ui/ErrorBox.svelte";
    import Modal from "$lib/components/modals/Modal.svelte";

    import type { MapConfig, MapLayer } from "$lib/mapModels";

    let { onClose, mapPath, mapConfig } = $props<{
        onClose: () => void;
        mapPath: string;
        mapConfig: MapConfig;
    }>();

    // Deep clone initial layers to local state for editing
    let layers = $state<MapLayer[]>(
        JSON.parse(JSON.stringify(mapConfig.layers)),
    );
    let isSaving = $state(false);

    // Validation state — computed reactively from layer images
    let error = $state<string | null>(null);
    let warning = $state<string | null>(null);
    let scaleFactor = $state(1);
    let newDimensions = $state<{ width: number; height: number } | null>(null);

    // Tracks the serialized image list so $effect only re-fires on actual changes
    let layerImageKey = $derived(layers.map((l) => l.image).join("|"));

    // --- Reactive Validation ---
    // Fires whenever any layer's image selection changes.
    // Validates all layers against the map's reference dimensions.
    $effect(() => {
        // Subscribe to the derived key so this re-runs on image changes
        void layerImageKey;
        validateAllLayers();
    });

    async function validateAllLayers() {
        // Reset state
        error = null;
        warning = null;
        scaleFactor = 1;
        newDimensions = null;

        // Skip validation if any layer has no image selected yet
        if (layers.some((l) => !l.image)) return;

        const refW = mapConfig.width;
        const refH = mapConfig.height;

        // Check base layer first (bottom-most — determines resize scaling)
        const baseLayer = layers[layers.length - 1];
        const basePath = $imagePathLookup.get(baseLayer.image.toLowerCase());
        if (!basePath) return;

        const baseResult = await checkLayerImage(
            convertFileSrc(basePath),
            refW,
            refH,
            baseLayer.name,
        );

        if (baseResult.error) {
            error = baseResult.error;
            return;
        }

        // Store base layer scaling info for save
        scaleFactor = baseResult.scaleFactor;
        newDimensions = scaleFactor !== 1 ? baseResult.dimensions : null;
        warning = baseResult.warning;

        // The target dimensions other layers must match
        const targetW = baseResult.dimensions?.width ?? refW;
        const targetH = baseResult.dimensions?.height ?? refH;

        // Check remaining layers against the (possibly new) base dimensions
        for (const layer of layers) {
            if (layer === baseLayer) continue;

            const fullPath = $imagePathLookup.get(layer.image.toLowerCase());
            if (!fullPath) continue;

            const result = await checkLayerImage(
                convertFileSrc(fullPath),
                targetW,
                targetH,
                layer.name,
            );

            if (result.error) {
                error = result.error;
                return;
            }
        }
    }

    // --- Layer Management ---

    function addLayer() {
        const id = crypto.randomUUID();
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

    // --- Save ---

    async function handleSave() {
        if (isSaving || error) return;

        // Basic Validation
        if (layers.some((l) => !l.image)) {
            alert("All layers must have an image selected.");
            return;
        }

        isSaving = true;

        try {
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

        {#if error}
            <ErrorBox>{error}</ErrorBox>
        {/if}

        {#if warning}
            <div class="warning-box">{warning}</div>
        {/if}

        <div class="modal-actions">
            <Button type="button" variant="ghost" onclick={onClose}
                >Cancel</Button
            >
            <Button
                type="submit"
                onclick={handleSave}
                disabled={isSaving || !!error}
            >
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
