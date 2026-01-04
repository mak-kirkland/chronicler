<script lang="ts">
    import type { PageHeader } from "$lib/bindings";
    import { vaultPath, allImages } from "$lib/worldStore";
    import { navigateToImage } from "$lib/actions";
    import { resolveImageSource } from "$lib/utils";
    import ErrorBox from "./ErrorBox.svelte";
    import ViewHeader from "./ViewHeader.svelte";
    import Icon from "./Icon.svelte";
    import { onMount, onDestroy } from "svelte";

    /**
     * The component properties, expecting the `data` for the image to display.
     * The `PageHeader` type contains the `path` and `title`.
     */
    let { data } = $props<{ data: PageHeader }>();

    let imageUrl = $state("");
    let error = $state<string | null>(null);

    // Calculate current index within the full list of images
    const currentIndex = $derived(
        $allImages.findIndex((img) => img.path === data.path),
    );

    const prevImage = $derived(
        currentIndex > -1
            ? $allImages[
                  (currentIndex - 1 + $allImages.length) % $allImages.length
              ]
            : null,
    );

    const nextImage = $derived(
        currentIndex > -1
            ? $allImages[(currentIndex + 1) % $allImages.length]
            : null,
    );

    function handlePrev() {
        if (prevImage) navigateToImage(prevImage);
    }

    function handleNext() {
        if (nextImage) navigateToImage(nextImage);
    }

    function handleKeydown(e: KeyboardEvent) {
        // Only trigger if no modifiers are pressed (to allow Alt+Arrow navigation)
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

        if (e.key === "ArrowLeft") {
            e.preventDefault();
            handlePrev();
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            handleNext();
        }
    }

    /**
     * This effect runs whenever the `data` or `$vaultPath` changes.
     * It uses the central utility to resolve the image source efficiently.
     */
    $effect(() => {
        let isCancelled = false;
        error = null; // Reset error state on change
        imageUrl = ""; // Reset image while loading

        async function loadUrl() {
            try {
                const url = await resolveImageSource(data.path, $vaultPath);
                if (!isCancelled) {
                    imageUrl = url;
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

    // Attach local key listeners for this view
    onMount(() => {
        window.addEventListener("keydown", handleKeydown);
    });

    onDestroy(() => {
        window.removeEventListener("keydown", handleKeydown);
    });
</script>

<div class="image-view-container">
    <ViewHeader>
        <div slot="left">
            <h2 class="view-title" title={data.title}>{data.title}</h2>
        </div>
        <div slot="right">
            <div class="cycle-controls">
                <span class="counter">
                    {currentIndex + 1} / {$allImages.length}
                </span>
            </div>
        </div>
    </ViewHeader>
    <div class="image-content">
        {#if error}
            <ErrorBox title="Image Error">{error}</ErrorBox>
        {:else if imageUrl}
            <img src={imageUrl} alt={data.title} />

            <!-- Navigation Overlays -->
            {#if prevImage}
                <button
                    class="nav-btn prev"
                    onclick={handlePrev}
                    title="Previous (Left Arrow)"
                >
                    <Icon type="back" />
                </button>
            {/if}
            {#if nextImage}
                <button
                    class="nav-btn next"
                    onclick={handleNext}
                    title="Next (Right Arrow)"
                >
                    <Icon type="forward" />
                </button>
            {/if}
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
    .cycle-controls {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        gap: 1rem;
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

    .nav-btn {
        position: fixed; /* Fixed relative to viewport prevents jumping when image resizes */
        top: 50%;
        transform: translateY(-50%);
        background-color: hsla(0, 0%, 0%, 0.3);
        color: white;
        border: none;
        border-radius: 50%;
        width: 3rem;
        height: 3rem;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition:
            opacity 0.2s,
            background-color 0.2s;
        z-index: 10;
    }
    /* Show buttons when hovering anywhere in the image area */
    .image-content:hover .nav-btn {
        opacity: 1;
    }
    .nav-btn:hover {
        background-color: hsla(0, 0%, 0%, 0.6);
    }
    .nav-btn.prev {
        left: calc(var(--sidebar-width) + 1rem);
    }
    .nav-btn.next {
        right: 1rem;
    }
    .nav-btn :global(svg) {
        width: 2rem;
        height: 2rem;
    }
</style>
