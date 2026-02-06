<script lang="ts">
    import {
        vaultPath,
        allImageFiles,
        imagePathLookup,
        world,
    } from "$lib/worldStore";
    import { writePageContent } from "$lib/commands";
    import { currentView } from "$lib/viewStores";
    import { registerMap } from "$lib/mapStore";
    import { join } from "@tauri-apps/api/path";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import { autofocus } from "$lib/domActions";
    import { normalizePath } from "$lib/utils";
    import { detectImageDimensions } from "$lib/mapUtils";
    import Button from "$lib/components/ui/Button.svelte";
    import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
    import Modal from "$lib/components/modals/Modal.svelte";
    import type { MapConfig } from "$lib/mapModels";

    let { onClose } = $props<{ onClose: () => void }>();

    let name = $state("");
    let selectedImage = $state("");
    let isCreating = $state(false);

    // Initialize to 0 to represent "unknown/invalid"
    let mapWidth = $state(0);
    let mapHeight = $state(0);

    // Watch for image selection to auto-detect dimensions
    $effect(() => {
        if (!selectedImage) {
            mapWidth = 0;
            mapHeight = 0;
            return;
        }

        // selectedImage is the filename/title from allImageFiles
        // We need the full path to load it for dimension detection
        const fullPath = $imagePathLookup.get(selectedImage.toLowerCase());

        if (fullPath) {
            const src = convertFileSrc(fullPath);
            // Use shared util
            detectImageDimensions(src)
                .then((dims) => {
                    mapWidth = dims.width;
                    mapHeight = dims.height;
                })
                .catch((err) => {
                    console.warn(`[CreateMapModal] Failed to load image:`, err);
                    mapWidth = 0;
                    mapHeight = 0;
                });
        }
    });

    async function handleSubmit(event?: Event) {
        if (event) event.preventDefault();

        if (
            !name ||
            !selectedImage ||
            !$vaultPath ||
            mapWidth === 0 ||
            mapHeight === 0
        ) {
            return;
        }

        isCreating = true;
        try {
            const filename = `${name.trim()}.cmap`;
            const filePath = await join($vaultPath, filename);
            const normalizedPath = normalizePath(filePath);

            const defaultMap: MapConfig = {
                version: "1.0",
                title: name.trim(),
                width: mapWidth,
                height: mapHeight,
                layers: [
                    {
                        id: "base",
                        name: "Base Layer",
                        image: selectedImage,
                        opacity: 1.0,
                        zIndex: 0,
                        visible: true,
                    },
                ],
                pins: [],
                shapes: [],
            };

            // 1. Write the file to disk
            await writePageContent(
                normalizedPath,
                JSON.stringify(defaultMap, null, 2),
            );

            // 2. Optimistically register it in the store
            registerMap(normalizedPath, defaultMap);

            // 3. Force refresh the file tree using the standard initialize method
            await world.initialize();

            onClose();

            // 4. Navigate
            currentView.set({
                type: "map",
                data: {
                    title: name.trim(),
                    path: normalizedPath,
                },
            });
        } catch (e) {
            console.error("Failed to create map:", e);
            alert("Failed to create map.");
        } finally {
            isCreating = false;
        }
    }
</script>

<Modal title="Create New Map" {onClose}>
    <form onsubmit={handleSubmit} class="form">
        <div class="form-group">
            <label for="map-name">Map Name</label>
            <input
                id="map-name"
                type="text"
                bind:value={name}
                use:autofocus
                placeholder="e.g. World Map"
            />
        </div>

        <div class="form-group">
            <label for="map-image">Base Image</label>
            <SearchableSelect
                options={$allImageFiles}
                bind:value={selectedImage}
                placeholder="Select a file..."
            />

            {#if selectedImage}
                {#if mapWidth > 0}
                    <p class="help-text dimension-text">
                        Detected: {mapWidth} x {mapHeight} px
                    </p>
                {:else}
                    <p class="help-text dimension-text">
                        Detecting dimensions...
                    </p>
                {/if}
            {:else}
                <p class="help-text">Select an image to begin.</p>
            {/if}
        </div>

        <div class="modal-actions">
            <Button type="button" variant="ghost" onclick={onClose}
                >Cancel</Button
            >
            <Button
                type="submit"
                disabled={!name ||
                    !selectedImage ||
                    mapWidth === 0 ||
                    isCreating}
            >
                {isCreating ? "Creating..." : "Create Map"}
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
    input {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 1rem;
        box-sizing: border-box;
    }
    input:focus {
        outline: 1px solid var(--color-accent-primary);
        border-color: var(--color-accent-primary);
    }
    .help-text {
        margin-top: 0.2rem;
        font-size: 0.85rem;
        color: var(--color-text-secondary);
        font-style: italic;
    }
    .dimension-text {
        font-weight: bold;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
    }
</style>
