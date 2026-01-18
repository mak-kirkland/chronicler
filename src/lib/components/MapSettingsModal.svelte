<script lang="ts">
    import { allImageFiles, imagePathLookup } from "$lib/worldStore";
    import { updateMapConfig } from "$lib/mapStore";
    import { resizeMapData } from "$lib/mapUtils";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import Button from "./Button.svelte";
    import SearchableSelect from "./SearchableSelect.svelte";
    import Modal from "./Modal.svelte";
    import type { MapConfig } from "$lib/mapModels";

    let { onClose, mapPath, mapConfig } = $props<{
        onClose: () => void;
        mapPath: string;
        mapConfig: MapConfig;
    }>();

    let selectedImage = $state("");
    let isSaving = $state(false);
    let error = $state<string | null>(null);
    let warning = $state<string | null>(null);
    let newDimensions = $state<{ width: number; height: number } | null>(null);
    let scaleFactor = $state(1);

    // Allow 1% deviation in aspect ratio to account for rounding errors
    const EPSILON = 0.01;

    $effect(() => {
        if (!selectedImage) {
            error = null;
            warning = null;
            newDimensions = null;
            return;
        }

        const fullPath = $imagePathLookup.get(selectedImage.toLowerCase());
        if (fullPath) {
            const img = new Image();
            img.onload = () => {
                const newW = img.naturalWidth;
                const newH = img.naturalHeight;
                const oldW = mapConfig.width;
                const oldH = mapConfig.height;

                const newRatio = newW / newH;
                const oldRatio = oldW / oldH;

                if (Math.abs(newRatio - oldRatio) > EPSILON) {
                    error = `Aspect ratio mismatch. Current map is ${oldW}x${oldH} (Ratio: ${oldRatio.toFixed(2)}), but selected image is ${newW}x${newH} (Ratio: ${newRatio.toFixed(2)}).`;
                    warning = null;
                    newDimensions = null;
                } else {
                    error = null;
                    scaleFactor = newW / oldW;
                    newDimensions = { width: newW, height: newH };

                    if (Math.abs(scaleFactor - 1) > 0.001) {
                        warning = `New image size: ${newW}x${newH}. Map objects will be rescaled by ${(scaleFactor * 100).toFixed(1)}% to maintain positions.`;
                    } else {
                        warning = null;
                    }
                }
            };
            img.onerror = () => {
                error = "Failed to load image for dimension check.";
                newDimensions = null;
            };
            img.src = convertFileSrc(fullPath);
        }
    });

    async function handleSave() {
        if (isSaving || error || !selectedImage || !newDimensions) return;
        isSaving = true;

        try {
            await updateMapConfig(mapPath, (currentConfig) => {
                // 1. Update Layers
                // We update the first layer or the one explicitly named 'base'.
                const updatedLayers = currentConfig.layers.map(
                    (layer, index) => {
                        if (layer.id === "base" || index === 0) {
                            return { ...layer, image: selectedImage };
                        }
                        return layer;
                    },
                );

                // 2. Perform Geometric Scaling
                const scaledConfig = resizeMapData(
                    currentConfig,
                    scaleFactor,
                    newDimensions!.width,
                    newDimensions!.height,
                );

                return {
                    ...scaledConfig,
                    layers: updatedLayers,
                };
            });
            onClose();
        } catch (e) {
            console.error(e);
            alert("Failed to update map image.");
        } finally {
            isSaving = false;
        }
    }
</script>

<Modal title="Map Settings" {onClose}>
    <form
        class="form"
        onsubmit={(e) => {
            e.preventDefault();
            handleSave();
        }}
    >
        <div class="form-group">
            <label for="map-image">New Base Image</label>
            <SearchableSelect
                id="map-image"
                options={$allImageFiles}
                bind:value={selectedImage}
                placeholder="Select a file..."
            />
            <p class="help-text">
                Select a new image. It must match the current map's aspect
                ratio.
            </p>
        </div>

        {#if error}
            <div class="error-box">{error}</div>
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
                disabled={!selectedImage || !!error || isSaving}
            >
                {isSaving ? "Saving..." : "Update Image"}
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
    .help-text {
        font-size: 0.85rem;
        color: var(--color-text-secondary);
        font-style: italic;
    }
    .error-box {
        color: var(--color-text-error);
        background: var(--color-background-error);
        padding: 0.75rem;
        border-radius: 4px;
        font-size: 0.9rem;
        border: 1px solid var(--color-border-error);
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
    }
</style>
