<script lang="ts">
    import { allImages, vaultPath } from "$lib/worldStore";
    import { currentView } from "$lib/viewStores";
    import { navigateToImage } from "$lib/actions";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import { getImageAsBase64 } from "$lib/commands";
    import { tick } from "svelte";

    let { searchTerm = "" } = $props<{ searchTerm?: string }>();

    // Filter images based on search term
    const filteredImages = $derived(
        $allImages.filter((img) =>
            img.title.toLowerCase().includes(searchTerm.toLowerCase()),
        ),
    );

    // Asynchronously resolve image sources
    function getImageSrc(path: string): Promise<string> {
        // This mirrors the logic in ImageView and Renderer
        if ($vaultPath && path.startsWith($vaultPath)) {
            // Fast path for in-vault images
            return Promise.resolve(convertFileSrc(path));
        } else {
            // Slower IPC path for external images
            return getImageAsBase64(path);
        }
    }

    // Effect to scroll the active item into view and focus it
    $effect(() => {
        // We need to wait for the DOM to update with the new active class
        // before we try to find the element.
        tick().then(() => {
            const activeElement = document.querySelector(
                ".gallery-item.active",
            ) as HTMLElement;
            if (activeElement) {
                activeElement.scrollIntoView({
                    block: "nearest",
                    inline: "nearest",
                });
                activeElement.focus();
            }
        });
        // Dependencies: Re-run when the view type or data path changes.
        $currentView.type;
        // Only 'image' and 'file' types have the 'data' property.
        if ("data" in $currentView) {
            $currentView.data?.path;
        }
    });
</script>

<div class="gallery-container">
    {#if filteredImages.length > 0}
        <div class="gallery-grid">
            {#each filteredImages as image (image.path)}
                <button
                    class="gallery-item"
                    class:active={$currentView.type === "image" &&
                        $currentView.data?.path === image.path}
                    onclick={() => navigateToImage(image)}
                    title={image.title}
                >
                    {#await getImageSrc(image.path)}
                        <div class="placeholder">...</div>
                    {:then src}
                        <img {src} alt={image.title} loading="lazy" />
                    {:catch}
                        <div class="error-placeholder">⚠️</div>
                    {/await}
                    <div class="gallery-caption">{image.title}</div>
                </button>
            {/each}
        </div>
    {:else}
        <p class="text-muted text-center">No images found.</p>
    {/if}
</div>

<style>
    .gallery-container {
        padding: 0.5rem;
    }

    .gallery-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        gap: 0.5rem;
    }

    .gallery-item {
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        overflow: hidden;
        border-radius: 4px;
        background-color: var(--color-background-secondary);
        border: 2px solid transparent; /* Use transparent border to prevent layout shift */
        transition:
            transform 0.1s,
            box-shadow 0.1s;
    }

    /* Remove default focus outline to prevent lingering border on click */
    .gallery-item:focus {
        outline: none;
    }

    /* Only show focus ring for keyboard navigation */
    .gallery-item:focus-visible {
        border-color: var(--color-accent-primary);
    }

    .gallery-item:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 4px var(--color-overlay-subtle);
        border-color: var(--color-accent-primary);
    }

    /* Active State Styles - Stronger border */
    .gallery-item.active {
        border-color: var(--color-accent-primary);
        box-shadow: 0 0 0 2px var(--color-accent-primary);
        background-color: var(--color-background-tertiary);
    }

    .gallery-item img {
        width: 100%;
        aspect-ratio: 1 / 1;
        object-fit: cover;
        display: block;
    }

    .gallery-caption {
        font-size: 0.75rem;
        padding: 0.25rem;
        width: 100%;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--color-text-secondary);
        background-color: var(--color-overlay-light);
    }

    .gallery-item.active .gallery-caption {
        color: var(--color-text-primary);
        font-weight: bold;
    }

    .placeholder,
    .error-placeholder {
        width: 100%;
        aspect-ratio: 1 / 1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.8rem;
        color: var(--color-text-secondary);
    }

    .text-muted.text-center {
        margin-top: 1rem;
        text-align: center;
    }
</style>
