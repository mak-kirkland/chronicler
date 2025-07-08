<script lang="ts">
    import { tags } from "$lib/worldStore";
    import { navigateToTag } from "$lib/actions";
    import ErrorBox from "./ErrorBox.svelte";

    type InfoboxData = {
        title?: string;
        image?: string;
        infobox?: string;
        error?: string;
        details?: string;
        tags?: string[];
        [key: string]: any; // Allow other dynamic properties from frontmatter
    };

    let {
        data,
        imageUrl,
        layout = "top",
    } = $props<{
        data: InfoboxData | null;
        imageUrl: string | null;
        layout?: "top" | "side";
    }>();

    let imageError = $state(false);
    let filteredData = $state<[string, any][]>([]);

    $effect(() => {
        imageError = false;
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

<div class="infobox" data-layout={layout}>
    <div class="infobox-content-wrapper">
        {#if imageUrl}
            <div class="image-column">
                {#if !imageError}
                    <div class="image-container">
                        <img
                            src={imageUrl}
                            alt={data?.title || "Infobox image"}
                            class="infobox-image"
                            onerror={() => (imageError = true)}
                        />
                    </div>
                {/if}

                {#if imageError}
                    <ErrorBox title="Image Error">
                        Could not load image: "{data?.image}"
                    </ErrorBox>
                {/if}
            </div>
        {/if}
        <div class="data-column">
            {#if data?.error}
                <ErrorBox title="YAML Parse Error">
                    {data.details || data.error}
                </ErrorBox>
            {/if}

            {#if data?.infobox}
                <h4>{data.infobox}</h4>
            {/if}

            <dl>
                {#each filteredData as [key, value]}
                    <dt>{key}</dt>
                    <dd>
                        {#if Array.isArray(value)}
                            <ul>
                                {#each value as item}
                                    <li>{@html item}</li>
                                {/each}
                            </ul>
                        {:else}
                            {@html value}
                        {/if}
                    </dd>
                {:else}
                    {#if data && !data.error && filteredData.length === 0 && (!data.tags || data.tags.length === 0)}
                        <div class="no-fields-message">
                            No additional fields to display.
                        </div>
                    {/if}
                {/each}

                {#if data?.tags && Array.isArray(data.tags) && data.tags.length > 0}
                    <dt>Tags</dt>
                    <dd class="tag-container">
                        {#each data.tags as tag (tag)}
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
        background-color: rgba(0, 0, 0, 0.03);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 1rem;
        font-size: 0.9rem;
    }
    .infobox-content-wrapper {
        display: block;
    }
    .infobox[data-layout="side"] .infobox-content-wrapper {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
    }
    .infobox[data-layout="side"] .image-column {
        flex: 0 0 270px;
        min-width: 0;
    }
    .infobox[data-layout="side"] .data-column {
        flex: 1;
        min-width: 0;
    }
    .image-container {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        margin-bottom: 1rem;
        background-color: rgba(0, 0, 0, 0.02);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        overflow: hidden;
    }
    .infobox[data-layout="side"] .image-container {
        margin-bottom: 0;
    }
    .infobox-image {
        max-width: 100%;
        max-height: 400px;
        object-fit: contain;
        border-radius: 2px;
    }
    .no-fields-message {
        font-style: italic;
        color: var(--ink-light);
        grid-column: 1 / -1;
        text-align: center;
        padding: 0.5rem;
    }
    h4 {
        font-family: "Uncial Antiqua", cursive;
        margin-top: 0;
        border-bottom: 1px solid var(--border-color);
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
        color: var(--ink-light);
    }
    dd {
        margin: 0;
    }
    dd ul {
        margin: 0;
        padding-left: 1.2rem;
    }
    :global(.infobox a.internal-link) {
        color: #2563eb;
        text-decoration: none;
        border-bottom: 1px dotted #2563eb;
        cursor: pointer;
    }
    :global(.infobox span.internal-link.broken) {
        color: #b04a4a;
        text-decoration: none;
        border-bottom: 1px dotted #b04a4a;
        cursor: help;
    }
    .tag-container {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .tag-link {
        background-color: rgba(0, 0, 0, 0.07);
        color: var(--ink);
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
        background-color: var(--parchment-dark);
        outline: none;
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
</style>
