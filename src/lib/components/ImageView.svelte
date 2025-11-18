<script lang="ts">
    import type { PageHeader } from "$lib/bindings";
    import { getImageAsBase64 } from "$lib/commands";
    import { vaultPath } from "$lib/worldStore";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import ErrorBox from "./ErrorBox.svelte";
    import ViewHeader from "./ViewHeader.svelte";

    /**
     * The component properties, expecting the `data` for the image to display.
     * The `PageHeader` type contains the `path` and `title`.
     */
    let { data } = $props<{ data: PageHeader }>();

    let imageUrl = $state("");
    let error = $state<string | null>(null);

    /**
     * This effect runs whenever the `data` or `$vaultPath` changes.
     * It determines the most efficient way to load the image:
     * 1. Asset Protocol (fast, streaming) for files inside the vault.
     * 2. Base64 (slower, robust fallback) for files outside the vault.
     */
    $effect(() => {
        let isCancelled = false;
        error = null; // Reset error state on change
        imageUrl = ""; // Reset image while loading

        async function loadUrl() {
            try {
                // Ensure we have a valid vault path to check against
                if ($vaultPath && data.path.startsWith($vaultPath)) {
                    // --- Case 1: File is inside the vault ---
                    // Use the asset protocol. This is zero-copy, cached, and fast.
                    const assetUrl = convertFileSrc(data.path);
                    if (!isCancelled) {
                        imageUrl = assetUrl;
                    }
                } else {
                    // --- Case 2: File is outside the vault ---
                    // The asset protocol is scoped to the vault for security.
                    // We must fall back to reading the file via IPC and converting to Base64.
                    const base64Url = await getImageAsBase64(data.path);
                    if (!isCancelled) {
                        imageUrl = base64Url;
                    }
                }
            } catch (e) {
                console.error("Failed to load image:", e);
                if (!isCancelled) {
                    error = `Could not load image: ${e}`;
                }
            }
        }

        loadUrl();

        // Cleanup function to prevent state updates if the component is destroyed
        // or if the `data` prop changes again before the async operation completes.
        return () => {
            isCancelled = true;
        };
    });
</script>

<div class="image-view-container">
    <ViewHeader>
        <div slot="left">
            <h2 class="view-title" title={data.title}>{data.title}</h2>
        </div>
    </ViewHeader>
    <div class="image-content">
        {#if error}
            <ErrorBox title="Image Error">{error}</ErrorBox>
        {:else if imageUrl}
            <img src={imageUrl} alt={data.title} />
        {/if}
    </div>
</div>

<style>
    .image-view-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
    }
    .view-title {
        font-family: var(--font-family-heading);
        color: var(--color-text-heading);
        margin: 0;
        font-size: 1.5rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .image-content {
        flex-grow: 1;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: auto;
        padding: 2rem;
    }
    img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 4px 15px var(--color-overlay-subtle);
    }
</style>
