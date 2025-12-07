<script lang="ts">
    import { navigateToTag, navigateToImage } from "$lib/actions";
    import { capitalizeFirstLetter, buildInfoboxLayout } from "$lib/utils";
    import ErrorBox from "./ErrorBox.svelte";
    import type { InfoboxData } from "$lib/types";
    import { openModal, closeModal } from "$lib/modalStore";
    import { areInfoboxTagsVisible } from "$lib/settingsStore";
    import InfoboxSettingsModal from "./InfoboxSettingsModal.svelte";
    import Carousel from "./Carousel.svelte";
    import ThemedIcon from "./ThemedIcon.svelte";

    // --- Props ---
    let { data } = $props<{
        data: InfoboxData | null;
    }>();

    // --- Derived State ---
    /**
     * This state variable holds the final, structured list of items to be rendered.
     */
    const renderItems = $derived(buildInfoboxLayout(data));

    // Prepare data for the Carousel component
    const carouselImages = $derived.by(() => {
        if (
            !data?.images ||
            !Array.isArray(data.images) ||
            data.images.length === 0
        ) {
            return [];
        }

        return data.images.map((src: string, index: number) => {
            // Get caption if available
            const caption =
                data.image_captions?.[index] &&
                typeof data.image_captions[index] === "string"
                    ? data.image_captions[index]
                    : undefined;

            // Get title or fallback
            const path = data.image_paths?.[index];
            const title =
                data.title ||
                (path ? path.split(/[\\/]/).pop() : "Infobox image");

            return {
                src,
                alt: title,
                title,
                caption,
                path,
            };
        });
    });

    // --- Actions ---
    function openImageView(index: number) {
        // Use the pre-calculated image object
        const img = carouselImages[index];

        if (img && img.path) {
            navigateToImage({
                path: img.path,
                title: img.title || "Image",
            });
        }
    }

    /**
     * Opens the infobox settings modal.
     */
    function openSettingsModal() {
        openModal({
            component: InfoboxSettingsModal,
            props: { onClose: closeModal },
        });
    }

    // --- Helper for Grid Layout ---
    function getRowCount(items: any[]) {
        if (!items || items.length === 0) return 0;
        return Math.max(
            0,
            ...items.map((v) => (Array.isArray(v) ? v.length : 1)),
        );
    }

    function getCellContent(colValue: any, rowIndex: number) {
        if (Array.isArray(colValue)) {
            return colValue[rowIndex] !== undefined ? colValue[rowIndex] : "";
        }
        return rowIndex === 0 ? colValue : "";
    }
</script>

<div class="infobox">
    <div class="infobox-content-wrapper">
        <div class="infobox-header">
            {#if data?.title}
                <h3 class="infobox-title">{@html data.title}</h3>
            {/if}
            <button
                class="infobox-controls-button"
                onclick={openSettingsModal}
                title="Infobox settings"
            >
                <ThemedIcon type="settings" />
            </button>
        </div>

        {#if data?.subtitle}
            <p class="infobox-subtitle">{@html data.subtitle}</p>
        {/if}

        <!--
            We use the shared Carousel component.
            - className="infobox-carousel tabbed":
              1. "infobox-carousel" applies the Infobox-specific styles defined below.
              2. "tabbed" triggers the tabbed navigation layout.
            - onImageClick: Handles the click event for the lightbox.
        -->
        {#if carouselImages.length > 0}
            <div class="image-column">
                <Carousel
                    images={carouselImages}
                    className="infobox-carousel tabbed"
                    onImageClick={openImageView}
                />
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

            <!-- The main definition list for key-value pairs. -->
            <dl>
                <!-- This loop iterates over the final, processed list of render items. -->
                {#each renderItems as renderItem, i (`${renderItem.type}-${i}`)}
                    {#if renderItem.type === "header"}
                        <!-- Injected headers span the full width of the grid. -->
                        <h4 class="layout-header">{@html renderItem.text}</h4>
                    {:else if renderItem.type === "separator"}
                        <hr class="layout-separator" />
                    {:else if renderItem.type === "group"}
                        <!-- Groups also span the full width to contain their own layout. -->
                        <!--
                            We transpose the data here to use CSS Grid for row alignment.
                            Instead of rendering column-by-column, we render cell-by-cell in row-major order.
                        -->
                        {@const rowCount = getRowCount(renderItem.items)}
                        {@const colCount = renderItem.items.length}

                        <div class="layout-group-wrapper">
                            <div
                                class="layout-grid"
                                style="grid-template-columns: repeat({colCount}, 1fr);"
                            >
                                {#each { length: rowCount } as _, rowIndex}
                                    {#each renderItem.items as colValue}
                                        <div class="layout-cell">
                                            {@html getCellContent(
                                                colValue,
                                                rowIndex,
                                            )}
                                        </div>
                                    {/each}
                                {/each}
                            </div>
                        </div>
                    {:else if renderItem.type === "default"}
                        <!-- Default items render as a standard key-value pair. -->
                        {@const [key, value] = renderItem.item}
                        <dt>{@html capitalizeFirstLetter(key)}</dt>
                        <dd>
                            {#if Array.isArray(value)}
                                <ul>
                                    {#each value as item, j (`${item}-${j}`)}
                                        <li>{@html item}</li>
                                    {/each}
                                </ul>
                            {:else}
                                {@html value}
                            {/if}
                        </dd>
                    {/if}
                {/each}

                <!-- Tags are rendered conditionally based on the global store -->
                {#if $areInfoboxTagsVisible}
                    {#if data?.tags && Array.isArray(data.tags) && data.tags.length > 0}
                        <hr class="layout-separator" />
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
                {/if}
            </dl>

            {#if data && !data.error && renderItems.length === 0 && (!data.tags || data.tags.length === 0 || !$areInfoboxTagsVisible)}
                <div class="no-fields-message text-muted text-center">
                    No additional fields to display.
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
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

    /* --- Header Styles --- */
    .infobox-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--space-sm);
        border-bottom: 1px solid var(--color-border-primary);
        padding-bottom: var(--space-sm);
        margin-bottom: var(--space-md);
    }

    .infobox-controls-button {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        font-size: 1.1rem; /* Adjust size of the emoji icon */
        color: var(--color-text-secondary);
        flex-shrink: 0; /* Prevents the button from shrinking */
        transition:
            color 0.2s ease,
            opacity 0.2s ease;
        line-height: 1.2; /* Align emoji better with title */
        opacity: 0;
    }

    /* Reveal the button when hovering over the header area */
    .infobox-header:hover .infobox-controls-button {
        opacity: 1;
    }

    .infobox-controls-button:hover,
    .infobox-controls-button:focus-visible {
        opacity: 1;
        color: var(--color-text-primary);
        outline: none;
    }
    /* --- End Header Styles --- */

    .infobox-title {
        font-family: var(--font-family-heading);
        font-size: 1.2rem;
        margin: 0;
        padding-bottom: 0;
        border-bottom: none;
        flex-grow: 1; /* Allow title to take available space */
        line-height: 1.2;
    }
    .infobox-subtitle {
        font-size: 1rem;
        /* Use a negative top margin to pull it closer to the title's bottom border */
        margin: -0.75rem 0 var(--space-md) 0;
        padding: 0;
    }
    .image-column {
        width: 100%;
        margin-bottom: var(--space-md);
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
        color: var(--color-text-secondary);
    }
    dd {
        margin: 0;
    }
    dd ul {
        margin: 0;
        padding-left: 1.2rem;
    }
    .infobox :global(.embedded-image) {
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
        word-break: break-word; /* Ensure long words break if necessary */
        text-align: left;
    }
    .tag-link:hover,
    .tag-link:focus {
        background-color: var(--color-background-tertiary);
        outline: none;
        transform: translateY(-1px);
        box-shadow: 0 2px 4px var(--color-overlay-subtle);
    }

    /* --- User-defined Layout Styles --- */
    .layout-header {
        /* Headers span all columns of the parent DL grid. */
        grid-column: 1 / -1;
        font-family: var(--font-family-heading);
        margin-top: var(--space-sm);
        margin-bottom: var(--space-xs);
        padding-bottom: var(--space-xs);
        border-bottom: 1px solid var(--color-border-primary);
        font-size: 0.95rem;
    }

    .layout-separator {
        grid-column: 1 / -1;
        border: none;
        border-top: 1px solid var(--color-border-primary);
        margin: var(--space-xs) 0;
    }

    .layout-group-wrapper {
        /* Groups also span all columns to contain their own layout context. */
        grid-column: 1 / -1;
        margin-bottom: var(--space-xs);
        padding-bottom: var(--space-xs);
    }

    .layout-grid {
        display: grid;
        gap: 0 var(--space-sm);
        align-items: start;
        /* grid-template-columns is set inline based on data */
    }

    .layout-cell {
        min-width: 0;
        /* Ensure long words don't break the layout */
        word-wrap: break-word;
        overflow-wrap: break-word;
    }

    /* --- Carousel Component Overrides (Decoupled from Child) --- */
    /* Target the Carousel component wrapper when it has the class 'infobox-carousel' */
    :global(.content-carousel.infobox-carousel) {
        margin-block: 0;
        margin-bottom: var(--space-md);
        width: 100%; /* Ensure it fills the infobox column */
    }

    :global(.content-carousel.infobox-carousel img) {
        width: 100%;
        height: auto;
        max-height: 400px; /* Specific height limit for Infobox */
        object-fit: contain;
    }

    /* Remove the boxy look for infoboxes so empty space (bars) is transparent/invisible */
    :global(.content-carousel.infobox-carousel .carousel-stack) {
        border: none;
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
        .infobox-header {
            flex-basis: 100%; /* Make the header span the full width */
        }
        .infobox-subtitle {
            flex-basis: 100%; /* Make the title/tabs span the full width */
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
