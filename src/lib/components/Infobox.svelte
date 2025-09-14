<script lang="ts">
    import { navigateToTag, navigateToImage } from "$lib/actions";
    import ErrorBox from "./ErrorBox.svelte";

    type InfoboxData = {
        title?: string;
        image?: string;
        image_path?: string; // The absolute path to the image, for opening in the viewer.
        subtitle?: string;
        infobox?: string;
        error?: string;
        details?: string; // Error details
        tags?: string[];
        [key: string]: any; // Allow other dynamic properties from frontmatter
    };

    let { data } = $props<{
        data: InfoboxData | null;
    }>();

    let filteredData = $state<[string, any][]>([]);

    /**
     * Derives a display title for the image, falling back from the page title
     * to the image filename.
     * @param pageTitle The title from the page's frontmatter.
     * @param imagePath The absolute path to the image file.
     * @returns A suitable title string for the image view.
     */
    function getImageTitle(
        pageTitle: string | undefined,
        imagePath: string,
    ): string {
        return pageTitle || imagePath.split(/[\\/]/).pop() || "Image";
    }

    /**
     * Handles the double-click event on the infobox image, navigating to the
     * full image view if a valid path exists.
     */
    function openImageView() {
        if (data?.image_path) {
            const imageTitle = getImageTitle(data.title, data.image_path);
            navigateToImage({
                path: data.image_path,
                title: imageTitle,
            });
        }
    }

    // This effect prepares the data for display by filtering out reserved keys.
    $effect(() => {
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
            "image",
            "image_path",
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

        {#if data?.image}
            <div class="image-column">
                <div class="image-container">
                    <button
                        type="button"
                        class="image-button"
                        onclick={openImageView}
                        aria-label={"View larger: " +
                            (data?.title || "Infobox image")}
                    >
                        <img
                            src={data.image}
                            alt={data?.title || "Infobox image"}
                            class="infobox-image"
                        />
                    </button>
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
    .infobox {
        background-color: var(--color-overlay-light);
        border: 1px solid var(--color-border-primary);
        border-radius: 8px;
        padding: 1rem;
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
        margin: 0 0 1rem 0;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .infobox-subtitle {
        font-size: 1rem;
        font-style: italic;
        /* Use a negative top margin to pull it closer to the title's bottom border */
        margin: -0.75rem 0 1rem 0;
        padding: 0;
    }
    .image-column {
        width: 100%;
        margin-bottom: 1rem;
    }
    .image-container {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        background-color: var(--color-overlay-subtle);
        border: 1px solid var(--color-border-primary);
        border-radius: 4px;
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
    }
    .no-fields-message {
        grid-column: 1 / -1;
        padding: 0.5rem;
    }
    h4 {
        font-family: var(--font-family-heading);
        margin-top: 0;
        border-bottom: 1px solid var(--color-border-primary);
        padding-bottom: 0.5rem;
        margin-bottom: 1rem;
    }
    dl {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.5rem 1rem;
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
        height: 1.2em; /* Use 'em' to scale with the surrounding text size */
        vertical-align: middle;
        margin-right: 0.25em;
    }
    .tag-container {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
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
            gap: 0rem 1rem;
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
