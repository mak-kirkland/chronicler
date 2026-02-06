<script lang="ts">
    /**
     * MapPreview.svelte
     *
     * Displays a hovering preview of an interactive map.
     * It shows the base layer image and the map title.
     */
    import { loadMapConfig } from "$lib/mapStore";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import { imagePathLookup } from "$lib/worldStore";
    import { currentView } from "$lib/viewStores";
    import { get } from "svelte/store";
    import HoverPreview from "$lib/components/ui/HoverPreview.svelte";
    import type { MapConfig } from "$lib/mapModels";

    let { anchorEl = null, targetPath = null } = $props<{
        anchorEl: HTMLElement | null;
        targetPath: string | null;
    }>();

    let mapConfig = $state<MapConfig | null>(null);
    let mapImageSrc = $state<string | null>(null);
    let isVisible = $state(false);

    // --- Navigation Safety Valve ---
    // When the user navigates (e.g. clicks the link), ensure the preview hides immediately.
    // This prevents "sticky" previews if the parent component doesn't clear props fast enough.
    $effect(() => {
        // Track the current view so we react to navigation changes.
        void $currentView;
        // Whenever the view changes, force hide the preview.
        isVisible = false;
    });

    // --- Data Fetching Effect ---
    $effect(() => {
        if (!targetPath || !anchorEl) {
            isVisible = false;
            mapConfig = null;
            mapImageSrc = null;
            return;
        }

        const timer = setTimeout(async () => {
            try {
                // loadMapConfig returns the cached version if available,
                // otherwise reads from disk and caches for future use.
                const config = await loadMapConfig(targetPath);
                if (!config) return;

                // Find the base layer image
                // We assume the first visible layer or just the first layer is the base
                const baseLayer =
                    config.layers.find((l) => l.visible) || config.layers[0];

                if (baseLayer) {
                    const lookup = get(imagePathLookup);
                    const fullImagePath = lookup.get(
                        baseLayer.image.toLowerCase(),
                    );

                    if (fullImagePath) {
                        mapImageSrc = convertFileSrc(fullImagePath);
                        mapConfig = config;
                        isVisible = true;
                    }
                }
            } catch (e) {
                console.error("Failed to load map preview:", e);
                isVisible = false;
            }
        }, 300);

        return () => clearTimeout(timer);
    });
</script>

<HoverPreview {anchorEl} {isVisible} width={300}>
    {#if mapConfig && mapImageSrc}
        <div class="map-preview-content">
            <h4 class="map-title">{mapConfig.title}</h4>
            <div class="image-wrapper">
                <img src={mapImageSrc} alt={mapConfig.title} />
            </div>
            <div class="map-meta">
                {#if mapConfig.pins.length > 0}
                    <span
                        >{mapConfig.pins.length}
                        {mapConfig.pins.length === 1 ? "Pin" : "Pins"}</span
                    >
                {/if}
                {#if mapConfig.pins.length > 0 && mapConfig.shapes.length > 0}
                    <span>•</span>
                {/if}
                {#if mapConfig.shapes.length > 0}
                    <span
                        >{mapConfig.shapes.length}
                        {mapConfig.shapes.length === 1
                            ? "Region"
                            : "Regions"}</span
                    >
                {/if}
            </div>
        </div>
    {/if}
</HoverPreview>

<style>
    .map-preview-content {
        padding: 0.5rem;
        background: var(--color-background-primary);
    }
    .map-title {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        text-align: center;
        border-bottom: 1px solid var(--color-border-primary);
        padding-bottom: 0.25rem;
    }
    .image-wrapper {
        width: 100%;
        height: 200px;
        background-color: #222;
        border-radius: 4px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    img {
        width: 100%;
        height: 100%;
        object-fit: cover; /* Fill the box, cropping if needed */
    }
    .map-meta {
        margin-top: 0.5rem;
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        display: flex;
        justify-content: center;
        gap: 0.5rem;
    }
</style>
