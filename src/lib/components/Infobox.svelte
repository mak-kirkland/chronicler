<script lang="ts">
    import { navigateToTag, navigateToImage } from "$lib/actions";
    import ErrorBox from "./ErrorBox.svelte";

    // --- Types ---
    type InfoboxData = {
        title?: string;
        subtitle?: string;
        images?: string[]; // Base64 data URLs for the carousel
        image_paths?: string[]; // Absolute file paths for opening in viewer
        infobox?: string;
        error?: string;
        details?: string; // Error details
        tags?: string[];
        [key: string]: any; // Allow other dynamic properties from frontmatter
    };

    // --- Props ---
    let { data } = $props<{
        data: InfoboxData | null;
    }>();

    // --- State ---
    let currentImageIndex = $state(0);
    let filteredData = $state<[string, any][]>([]);

    // --- Derived State ---
    const hasCarousel = $derived(data?.images && data.images.length > 1);

    // --- Carousel Navigation ---
    function nextImage() {
        if (!data?.images) return;
        currentImageIndex = (currentImageIndex + 1) % data.images.length;
    }

    function prevImage() {
        if (!data?.images) return;
        currentImageIndex =
            (currentImageIndex - 1 + data.images.length) % data.images.length;
    }

    function goToImage(index: number) {
        currentImageIndex = index;
    }

    // --- Actions ---
    function openImageView() {
        if (data?.image_paths && data.image_paths[currentImageIndex]) {
            const currentImagePath = data.image_paths[currentImageIndex];
            const imageTitle =
                data.title || currentImagePath.split(/[\\/]/).pop() || "Image";

            navigateToImage({
                path: currentImagePath,
                title: imageTitle,
            });
        }
    }

    // --- Effects ---
    $effect(() => {
        // Reset image index when data source changes
        currentImageIndex = 0;

        if (!data || typeof data !== "object") {
            filteredData = [];
            return;
        }

        // These keys are handled separately in the template, so we filter them out.
        const excludedKeys = [
            "title",
            "subtitle",
            "tags",
            "infobox",
            "images",
            "image_paths",
            "error",
            "details", // Error details
        ];

        try {
            // Get all other key-value pairs from the data object to display in the list.
            const entries = Object.entries(data).filter(
                ([key]) => !excludedKeys.includes(key),
            );
            filteredData = entries;
        } catch (e) {
            console.error("Error processing infobox data:", e, data);
            filteredData = [];
        }
    });
</script>

<div class="infobox">
    <div class="infobox-content-wrapper">
        {#if data?.title}
            <h3 class="infobox-title">{@html data.title}</h3>
        {/if}

        {#if data?.subtitle}
            <p class="infobox-subtitle">{@html data.subtitle}</p>
        {/if}

        <!-- Image Column -->
        {#if data?.images && data.images.length > 0}
            <div class="image-column">
                <div class="image-container">
                    <button
                        type="button"
                        class="image-button"
                        onclick={openImageView}
                        aria-label="View larger: {data?.title ||
                            'Infobox image'}"
                    >
                        <img
                            src={data.images[currentImageIndex]}
                            alt={data?.title || "Infobox image"}
                            class="infobox-image"
                        />
                    </button>

                    <!-- Carousel Controls -->
                    {#if hasCarousel}
                        <button
                            class="carousel-button prev"
                            onclick={prevImage}
                            aria-label="Previous image"
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path
                                    d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                                ></path>
                            </svg>
                        </button>
                        <button
                            class="carousel-button next"
                            onclick={nextImage}
                            aria-label="Next image"
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path
                                    d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"
                                ></path>
                            </svg>
                        </button>
                        <div class="carousel-dots">
                            {#each data.images as _, i}
                                <button
                                    class="dot"
                                    class:active={currentImageIndex === i}
                                    onclick={() => goToImage(i)}
                                    aria-label="Go to image {i + 1}"
                                ></button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

        <div class="data-column">
            {#if data?.error}
                <ErrorBox title="YAML Parse Error"
                    >{data.details || data.error}</ErrorBox
                >
            {/if}

            {#if data?.infobox}
                <h4>{@html data.infobox}</h4>
            {/if}

            <dl>
                <!--
                  Add unique key to prevent error from duplicate fields in its frontmatter.
                -->
                {#each filteredData as [key, value], i (`${key}-${i}`)}
                    <dt>{key}</dt>
                    <dd>
                        {#if Array.isArray(value)}
                            <ul>
                                <!--
                                  Add unique key to prevent error from duplicate values in a key
                                -->
                                {#each value as item, j (`${item}-${j}`)}
                                    <li>{@html item}</li>
                                {/each}
                            </ul>
                        {:else}
                            {@html value}
                        {/if}
                    </dd>
                {:else}
                    {#if data && !data.error && filteredData.length === 0 && (!data.tags || data.tags.length === 0)}
                        <div class="no-fields-message text-muted text-center">
                            No additional fields to display.
                        </div>
                    {/if}
                {/each}

                {#if data?.tags && Array.isArray(data.tags) && data.tags.length > 0}
                    <dt>Tags</dt>
                    <dd class="tag-container">
                        <!--
                          Add unique key to prevent error from duplicate tags in its frontmatter.
                        -->
                        {#each data.tags as tag, i (`${tag}-${i}`)}
                            <button
                                class="tag-link"
                                onclick={() => navigateToTag(tag)}
                            >
                                #{tag}
                            </button>
                        {/each}
                    </dd>
                {/if}
            </dl>
        </div>
    </div>
</div>

<style>
    :root {
        /* Base size: 1rem is typically 16px */
        --space-xs: 0.25rem; /* 4px */
        --space-sm: 0.5rem; /* 8px */
        --space-md: 1rem; /* 16px */

        --control-size: 2rem; /* 32px */
        --dot-size: 0.625rem; /* 10px */
        --icon-size: 1.5rem; /* 24px */
    }

    .infobox {
        background-color: var(--color-overlay-light);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--space-sm);
        padding: var(--space-md);
        font-size: 0.9rem;
        container-type: inline-size;
    }
    .infobox-content-wrapper {
        /* Defaults to a stacked layout */
        display: block;
    }
    .infobox-title {
        font-family: var(--font-family-heading);
        font-size: 1.2rem;
        margin: 0 0 var(--space-md) 0;
        padding-bottom: var(--space-sm);
        border-bottom: 1px solid var(--color-border-primary);
    }
    .infobox-subtitle {
        font-size: 1rem;
        font-style: italic;
        /* Use a negative top margin to pull it closer to the title's bottom border */
        margin: -0.75rem 0 var(--space-md) 0;
        padding: 0;
    }
    .image-column {
        width: 100%;
        margin-bottom: var(--space-md);
    }
    .image-container {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        background-color: var(--color-overlay-subtle);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--space-xs);
        overflow: hidden;
    }
    .image-button {
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        line-height: 0; /* Prevents extra spacing */
    }
    /* Adds a visible outline for keyboard users, which is an accessibility best practice */
    .image-button:focus-visible {
        outline: 2px solid var(--color-accent, Highlight);
        outline-offset: 2px;
        border-radius: 2px;
    }
    .infobox-image {
        max-width: 100%;
        max-height: 400px;
        object-fit: contain;
        border-radius: 2px;
        transition: opacity 0.3s ease-in-out;
    }

    /* --- Carousel Styles --- */
    .carousel-button {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        background-color: hsla(0, 0%, 0%, 0.3);
        color: white;
        border: none;
        border-radius: 50%;
        width: var(--control-size);
        height: var(--control-size);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition:
            opacity 0.2s ease-in-out,
            background-color 0.2s ease;
        z-index: 10;
        box-shadow: 0 2px 4px hsla(0, 0%, 0%, 0.2);
    }
    .image-container:hover .carousel-button {
        opacity: 1;
    }
    .carousel-button:hover {
        background-color: hsla(0, 0%, 0%, 0.6);
    }
    .carousel-button.prev {
        left: var(--space-sm);
    }
    .carousel-button.next {
        right: var(--space-sm);
    }
    .carousel-button svg {
        width: var(--icon-size);
        height: var(--icon-size);
    }
    .carousel-dots {
        position: absolute;
        bottom: var(--space-sm);
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: var(--space-sm);
        z-index: 10;
    }
    .dot {
        width: var(--dot-size);
        height: var(--dot-size);
        border-radius: 50%;
        background-color: hsla(0, 100%, 100%, 0.5);
        border: 1px solid hsla(0, 0%, 0%, 0.2);
        padding: 0;
        cursor: pointer;
        transition: background-color 0.2s ease;
    }
    .dot:hover {
        background-color: hsla(0, 100%, 100%, 0.8);
    }
    .dot.active {
        background-color: white;
    }

    /* --- Data Styles --- */
    .no-fields-message {
        grid-column: 1 / -1;
        padding: var(--space-sm);
    }
    h4 {
        font-family: var(--font-family-heading);
        margin-top: 0;
        border-bottom: 1px solid var(--color-border-primary);
        padding-bottom: var(--space-sm);
        margin-bottom: var(--space-md);
    }
    dl {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: var(--space-sm) var(--space-md);
        align-items: baseline;
    }
    dt {
        font-weight: bold;
        text-transform: capitalize;
        color: var(--color-text-secondary);
    }
    dd {
        margin: 0;
    }
    dd ul {
        margin: 0;
        padding-left: 1.2rem;
    }
    dd :global(.embedded-image) {
        height: 1.2em;
        vertical-align: middle;
        margin-right: var(--space-xs);
    }
    .tag-container {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-sm);
    }
    .tag-link {
        background-color: var(--color-overlay-dark);
        color: var(--color-text-primary);
        padding: 0.2rem 0.6rem;
        border-radius: 9999px; /* pill shape */
        font-size: 0.8rem;
        font-weight: bold;
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.2s ease-in-out;
    }
    .tag-link:hover,
    .tag-link:focus {
        background-color: var(--color-background-tertiary);
        outline: none;
        transform: translateY(-1px);
        box-shadow: 0 2px 4px var(--color-overlay-subtle);
    }
    /* --- Container Query for responsive layout --- */
    /* When the infobox container is wider than 480px, switch to a side-by-side layout */
    @container (width > 480px) {
        .infobox-content-wrapper {
            display: flex;
            gap: 0 var(--space-md);
            align-items: flex-start;
            flex-wrap: wrap;
        }
        .infobox-title,
        .infobox-subtitle {
            flex-basis: 100%; /* Make the title span the full width */
        }
        .image-column {
            flex: 0 0 270px;
            min-width: 0;
            margin-bottom: 0;
        }
        .data-column {
            flex: 1;
            min-width: 0;
        }
    }
</style>
