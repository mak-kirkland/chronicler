<script lang="ts">
    import { convertFileSrc } from "@tauri-apps/api/core";
    import type { PageHeader } from "$lib/bindings";
    import ErrorBox from "./ErrorBox.svelte";

    /**
     * The component properties, expecting the `data` for the image to display.
     * The `PageHeader` type contains the `path` and `title`.
     */
    let { data } = $props<{ data: PageHeader }>();

    let imageUrl = $state("");
    let error = $state<string | null>(null);

    /**
     * This effect runs whenever the `data` prop changes. It uses Tauri's
     * `convertFileSrc` API to create a usable URL from the local file path,
     * which is then used in the `<img>` tag's src attribute.
     */
    $effect(() => {
        let isCancelled = false;

        async function getUrl() {
            try {
                const url = convertFileSrc(data.path);
                if (!isCancelled) {
                    imageUrl = url;
                }
            } catch (e) {
                console.error("Failed to convert image path:", e);
                if (!isCancelled) {
                    error = `Could not load image: ${e}`;
                }
            }
        }

        getUrl();

        // Cleanup function to prevent state updates if the component is destroyed
        // or if the `data` prop changes again before the async operation completes.
        return () => {
            isCancelled = true;
        };
    });
</script>

<div class="image-view-container">
    <div class="view-header">
        <h2 class="view-title" title={data.title}>{data.title}</h2>
    </div>
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
    .view-header {
        display: flex;
        align-items: center;
        padding: 0 2rem;
        background-color: var(--color-background-header);
        border-bottom: 1px solid var(--color-border-primary);
        height: 60px;
        flex-shrink: 0;
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
