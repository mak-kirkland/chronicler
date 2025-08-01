<script lang="ts">
    import { navigateToTag } from "$lib/actions";
    import ErrorBox from "./ErrorBox.svelte";
    import { vaultPath } from "$lib/worldStore";
    import { resolveImageUrl } from "$lib/utils";

    type InfoboxData = {
        title?: string;
        image?: string;
        infobox?: string;
        error?: string;
        details?: string;
        tags?: string[];
        [key: string]: any; // Allow other dynamic properties from frontmatter
    };

    let { data } = $props<{
        data: InfoboxData | null;
    }>();

    let imageUrl = $state<string | null>(null);
    let imageError = $state<string | null>(null);
    let filteredData = $state<[string, any][]>([]);

    // This effect resolves the image URL
    $effect(() => {
        // Reset state when data changes
        imageError = null;
        imageUrl = null;

        if (data?.image) {
            resolveImageUrl($vaultPath, data.image)
                .then((url) => {
                    imageUrl = url;
                })
                .catch((e: Error) => {
                    console.error(e);
                    imageError = e.message;
                });
        }
    });

    // This effect prepares the data for display by filtering out reserved keys.
    $effect(() => {
        if (!data || typeof data !== "object") {
            filteredData = [];
            return;
        }

        // These keys are handled separately in the template, so we filter them out.
        const excludedKeys = [
            "title",
            "tags",
            "infobox",
            "image",
            "error",
            "details",
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
        {#if data?.image}
            <div class="image-column">
                {#if imageUrl && !imageError}
                    <div class="image-container">
                        <img
                            src={imageUrl}
                            alt={data?.title || "Infobox image"}
                            class="infobox-image"
                            onerror={() => (imageError = "Invalid image")}
                        />
                    </div>
                {:else if imageError}
                    <ErrorBox title="Image Error"
                        >Could not load image {data.image} : {imageError}</ErrorBox
                    >
                {/if}
            </div>
        {/if}

        <div class="data-column">
            {#if data?.error}
                <ErrorBox title="YAML Parse Error"
                    >{data.details || data.error}</ErrorBox
                >
            {/if}

            {#if data?.infobox}
                <h4>{data.infobox}</h4>
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
    :global(.infobox a.internal-link) {
        color: var(--color-text-link);
        text-decoration: none;
        border-bottom: 1px dotted var(--color-text-link);
        cursor: pointer;
    }
    :global(.infobox span.internal-link.broken) {
        color: var(--color-text-link-broken);
        text-decoration: none;
        border-bottom: 1px dotted var(--color-text-link-broken);
        cursor: help;
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
            gap: 1rem;
            align-items: flex-start;
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
