<script lang="ts">
    import { open } from "@tauri-apps/plugin-dialog";
    import { createMap } from "$lib/commands";
    import { closeModal } from "$lib/modalStore";
    import { world } from "$lib/worldStore";
    import { navigateToMap } from "$lib/actions";
    import { autofocus } from "$lib/domActions";
    import Modal from "./Modal.svelte";
    import Button from "./Button.svelte";

    let { onClose } = $props<{ onClose: () => void }>();

    let title = $state("");
    let imagePath = $state("");
    let isProcessing = $state(false);

    async function selectImage() {
        try {
            const selected = await open({
                multiple: false,
                filters: [
                    {
                        name: "Image",
                        extensions: ["png", "jpg", "jpeg", "webp"],
                    },
                ],
            });
            if (typeof selected === "string") {
                imagePath = selected;
            }
        } catch (e) {
            console.error("Failed to open image dialog:", e);
            alert(`Error selecting image: ${e}`);
        }
    }

    async function handleSubmit() {
        if (!title.trim() || !imagePath.trim()) {
            alert("Please provide a title and select an image for the map.");
            return;
        }

        isProcessing = true;
        try {
            const newMapPath = await createMap(title, imagePath);
            await world.initialize();
            navigateToMap({ title, path: newMapPath });
            closeModal();
        } catch (e) {
            console.error("Failed to create map:", e);
            alert(`Error creating map: ${e}`);
        } finally {
            isProcessing = false;
        }
    }
</script>

<Modal title="Create New Map" {onClose}>
    <form onsubmit={handleSubmit} class="form">
        <div class="form-group">
            <label for="map-title">Map Title</label>
            <input
                id="map-title"
                type="text"
                bind:value={title}
                placeholder="Name of your new map"
                use:autofocus
            />
        </div>

        <div class="form-group">
            <label for="map-image">Map Image</label>
            <div class="image-selector">
                <input
                    id="map-image"
                    type="text"
                    bind:value={imagePath}
                    placeholder="Select an image file from your vault"
                    readonly
                />
                <Button type="button" onclick={selectImage}>Browse...</Button>
            </div>
        </div>

        <div class="modal-actions">
            <Button type="button" variant="ghost" onclick={onClose}
                >Cancel</Button
            >
            <Button type="submit" disabled={isProcessing}
                >{isProcessing ? "Creating..." : "Create Map"}</Button
            >
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
    .image-selector {
        display: flex;
        gap: 0.5rem;
    }
    .image-selector input {
        flex-grow: 1;
        background-color: var(--color-background-secondary);
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
    }
</style>
