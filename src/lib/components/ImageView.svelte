<script lang="ts">
    import type { PageHeader } from "$lib/bindings";
    import { getImageAsBase64 } from "$lib/commands";
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
     * This effect runs whenever the `data` prop changes. It now calls the
     * backend to get the image as a Base64 Data URL.
     */
    $effect(() => {
        let isCancelled = false;

        async function getUrl() {
            try {
                // Call the backend command to do the heavy lifting
                const url = await getImageAsBase64(data.path);

                if (!isCancelled) {
                    imageUrl = url;
                }
            } catch (e) {
                console.error("Failed to get image as Base64:", e);
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
