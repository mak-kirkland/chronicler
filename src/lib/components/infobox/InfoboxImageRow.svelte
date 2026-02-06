<script lang="ts">
    import { resolveImageSource } from "$lib/utils";
    import { imagePathLookup, vaultPath } from "$lib/worldStore";
    import AutocompleteInput from "$lib/components/ui/AutocompleteInput.svelte";
    import Icon from "$lib/components/ui/Icon.svelte";
    import type { ImageEntry } from "$lib/infobox";

    let {
        image = $bindable(),
        allImageFiles,
        isFirst,
        isLast,
        onMove,
        onDelete,
    } = $props<{
        image: ImageEntry;
        allImageFiles: string[];
        isFirst: boolean;
        isLast: boolean;
        onMove: (dir: -1 | 1) => void;
        onDelete: () => void;
    }>();

    let previewUrl = $state("");

    // Only re-run this when THIS specific image's src or vaultPath changes
    $effect(() => {
        // If no src, clear preview
        if (!image.src || !$vaultPath) {
            previewUrl = "";
            return;
        }

        // Use a local flag to prevent setting state on unmounted components
        // if the promise resolves after the row is removed.
        let active = true;

        // 1. Internal Lookup: Check if the filename exists in our index
        const absolutePath = $imagePathLookup.get(image.src.toLowerCase());

        // 2. Decide which path to resolve:
        //    - If found in index: Use absolute path (C:/Vault/...) -> Standard util will see it starts with vaultPath -> FAST
        //    - If not found: Use what user typed -> Standard util will see it's not absolute -> Slow Base64 fallback (correct for external URLs)
        const path_to_resolve = absolutePath || image.src;

        resolveImageSource(path_to_resolve, $vaultPath).then((url) => {
            if (active) previewUrl = url;
        });

        return () => {
            active = false;
        };
    });
</script>

<div class="image-card">
    <div class="image-preview-box">
        {#if previewUrl}
            <img src={previewUrl} alt="preview" />
        {:else}
            <div class="empty-icon">
                <Icon type="image" />
            </div>
        {/if}
    </div>

    <div class="image-details">
        <div class="autocomplete-wrapper">
            <label for="img-src-{image.id}">Source</label>
            <AutocompleteInput
                bind:value={image.src}
                options={allImageFiles}
                placeholder="my-image.png"
                id="img-src-{image.id}"
            />
        </div>

        <label for="img-cap-{image.id}"
            >Caption <span class="sub-label">(Optional)</span></label
        >
        <input
            id="img-cap-{image.id}"
            type="text"
            class="form-input"
            bind:value={image.caption}
            placeholder="Caption..."
        />
    </div>

    <div class="image-actions">
        <button class="icon-btn" onclick={() => onMove(-1)} disabled={isFirst}
            >▲</button
        >
        <button class="icon-btn" onclick={() => onMove(1)} disabled={isLast}
            >▼</button
        >
        <button class="icon-btn danger" onclick={onDelete}>
            <Icon type="close" />
        </button>
    </div>
</div>

<style>
    .image-card {
        display: flex;
        gap: 1rem;
        padding: 1rem;
        background: var(--color-background-tertiary);
        border-radius: 8px;
        border: 1px solid var(--color-border-primary);
    }
    .image-preview-box {
        width: 80px;
        height: 80px;
        background: black;
        border-radius: 4px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }
    .image-preview-box img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .empty-icon {
        color: white;
        opacity: 0.5;
    }
    .image-details {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 0;
    }
    .image-actions {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        justify-content: center;
    }
    label {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .sub-label {
        font-weight: normal;
        text-transform: none;
        font-style: italic;
    }
    .autocomplete-wrapper {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }
</style>
