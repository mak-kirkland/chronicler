<script lang="ts">
    import type { ImageEntry } from "$lib/infobox";
    import InfoboxImageRow from "$lib/components/infobox/InfoboxImageRow.svelte";
    import Button from "$lib/components/ui/Button.svelte";

    let {
        images = $bindable(),
        allImageFiles,
        onAddImage,
    } = $props<{
        images: ImageEntry[];
        allImageFiles: string[];
        onAddImage: () => void;
    }>();

    function removeImage(index: number) {
        images = images.filter((_: any, i: number) => i !== index);
    }

    function handleMove(index: number, direction: number) {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= images.length) return;
        images = images
            .with(index, images[targetIndex])
            .with(targetIndex, images[index]);
    }
</script>

<div class="form-section">
    <div class="custom-fields-header">
        <h4>Images</h4>
        <Button size="small" onclick={onAddImage}>+ Add Image</Button>
    </div>
    <p class="helper-text" style="margin-top: -0.5rem;">
        Add multiple images to create a carousel.
    </p>

    {#each images as img, i (img.id)}
        <InfoboxImageRow
            bind:image={images[i]}
            {allImageFiles}
            isFirst={i === 0}
            isLast={i === images.length - 1}
            onMove={(dir) => handleMove(i, dir)}
            onDelete={() => removeImage(i)}
        />
    {/each}

    <!-- Add Image Button at Bottom (Only if items exist) -->
    {#if images.length > 0}
        <div class="bottom-add-container">
            <Button size="small" onclick={onAddImage}>+ Add Image</Button>
        </div>
    {/if}
</div>

<style>
    .form-section {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        min-width: 0;
    }
    .custom-fields-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .custom-fields-header h4 {
        margin: 0;
    }
    .helper-text {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        margin: 0;
    }
    .bottom-add-container {
        margin-top: 1rem;
        display: flex;
    }
</style>
