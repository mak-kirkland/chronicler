<script lang="ts">
    import { navigateToTag, navigateToImage } from "$lib/actions";
    import { capitalizeFirstLetter } from "$lib/utils";
    import ErrorBox from "./ErrorBox.svelte";
    import type {
        InfoboxData,
        LayoutGroup,
        RenderItem,
        LayoutItem,
    } from "$lib/types";
    import { openModal, closeModal } from "$lib/modalStore";
    import { areInfoboxTagsVisible } from "$lib/settingsStore";
    import InfoboxSettingsModal from "./InfoboxSettingsModal.svelte";

    // --- Props ---
    let { data } = $props<{
        data: InfoboxData | null;
    }>();

    // --- State ---
    let currentImageIndex = $state(0);
    /**
     * This state variable holds the final, structured list of items to be rendered.
     * It's built by the $effect hook, which processes the raw `data` prop and
     * applies the custom `layout` rules.
     */
    let renderItems = $state<RenderItem[]>([]);

    // --- Derived State ---
    const hasCarousel = $derived(data?.images && data.images.length > 1);
    const hasCaptions = $derived(
        hasCarousel &&
            data?.image_captions &&
            data.image_captions.length === data.images.length &&
            data.image_captions.some(
                (c) => typeof c === "string" && c.length > 0,
            ),
    );

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

    /**
     * Opens the infobox settings modal.
     */
    function openSettingsModal() {
        openModal({
            component: InfoboxSettingsModal,
            props: { onClose: closeModal },
        });
    }

    // --- Effects ---
    $effect(() => {
        // This effect is the core of the dynamic layout logic. It runs whenever the
        // `data` prop changes and transforms the raw frontmatter into a structured
        // list of `RenderItem` objects that the template can easily display.

        currentImageIndex = 0; // Reset image index on data change

        if (!data || typeof data !== "object") {
            renderItems = [];
            return;
        }

        // Define keys that are handled by dedicated UI elements (like the title,
        // image carousel, and tags) and should be excluded from the main data list.
        const excludedKeys = new Set([
            "title",
            "subtitle",
            "tags",
            "infobox",
            "images",
            "image_paths",
            "image_captions",
            "error",
            "details", // Error details
            "layout", // The layout key itself is for rules, not display.
        ]);

        // 1. Get all renderable key-value pairs from the frontmatter, preserving
        //    their original order as defined in the YAML file.
        const allEntries = Object.entries(data).filter(
            ([key]) => !excludedKeys.has(key),
        );

        const layout = data.layout;
        const finalItems: RenderItem[] = [];
        const processedKeys = new Set<string>();

        // 2. Pre-process layout rules into Maps for efficient O(1) lookups.
        //    This avoids re-iterating the layout array for every frontmatter key.

        // Generic maps for any "positioned" items (headers, separators, etc.)
        const aboveRules = new Map<string, LayoutItem[]>();
        const belowRules = new Map<string, LayoutItem[]>();
        // Specific map for groups, as they are processed differently.
        const groupRules = new Map<string, LayoutGroup>();

        if (layout && Array.isArray(layout)) {
            for (const rule of layout) {
                if (rule.type === "header" || rule.type === "separator") {
                    if (rule.position?.above) {
                        const key = rule.position.above;
                        if (!aboveRules.has(key)) aboveRules.set(key, []);
                        aboveRules.get(key)!.push(rule);
                    } else if (rule.position?.below) {
                        const key = rule.position.below;
                        if (!belowRules.has(key)) belowRules.set(key, []);
                        belowRules.get(key)!.push(rule);
                    }
                } else if (rule.type === "group" && rule.keys?.length > 0) {
                    // A group rule is triggered by its *first* key.
                    groupRules.set(rule.keys[0], rule);
                }
            }
        }

        /**
         * Helper function to push positioned rules (headers, separators)
         * onto the final render list.
         */
        function pushPositionedRules(rules: LayoutItem[]) {
            for (const rule of rules) {
                if (rule.type === "header") {
                    finalItems.push({ type: "header", text: rule.text });
                } else if (rule.type === "separator") {
                    finalItems.push({ type: "separator" });
                }
            }
        }

        // 3. Iterate through the original frontmatter entries to build the final
        //    render list, applying the injection rules as we go.
        for (const [key, value] of allEntries) {
            // Skip this key if it was already rendered as part of a group.
            if (processedKeys.has(key)) {
                continue;
            }

            // INJECTION POINT 1: Check for 'above' rules
            if (aboveRules.has(key)) {
                pushPositionedRules(aboveRules.get(key)!);
            }

            // INJECTION POINT 2: Check if this key is the trigger for a group.
            if (groupRules.has(key)) {
                const rule = groupRules.get(key)!;
                const groupValues: any[] = [];

                // Collect all values specified in the group rule.
                for (const groupKey of rule.keys) {
                    if (data[groupKey] !== undefined) {
                        groupValues.push(data[groupKey]);
                        processedKeys.add(groupKey); // Mark key as processed.
                    }
                }
                finalItems.push({
                    type: "group",
                    render_as: rule.render_as,
                    items: groupValues,
                });

                // INJECTION POINT 3 (Groups): Check for 'below' rules on the *last*
                // key of the group.
                const lastKeyInGroup = rule.keys[rule.keys.length - 1];
                if (belowRules.has(lastKeyInGroup)) {
                    pushPositionedRules(belowRules.get(lastKeyInGroup)!);
                }
            } else {
                // If the key is not part of any special rule, render it as a default item.
                finalItems.push({ type: "default", item: [key, value] });

                // INJECTION POINT 3 (Default): Check for 'below' rules.
                if (belowRules.has(key)) {
                    pushPositionedRules(belowRules.get(key)!);
                }
            }
        }
        renderItems = finalItems;
    });
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
                ⚙️
            </button>
        </div>

        {#if data?.subtitle}
            <p class="infobox-subtitle">{@html data.subtitle}</p>
        {/if}

        <!-- Render Image Tabs here if they exist -->
        {#if hasCaptions}
            <div class="carousel-tabs">
                {#each data.images as _, i}
                    {#if data.image_captions?.[i]}
                        <button
                            class="tab"
                            class:active={currentImageIndex === i}
                            onclick={() => goToImage(i)}
                        >
                            {@html data.image_captions[i]}
                        </button>
                    {/if}
                {/each}
            </div>
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
                            <svg viewBox="0 0 24 24" fill="currentColor"
                                ><path
                                    d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                                ></path></svg
                            >
                        </button>
                        <button
                            class="carousel-button next"
                            onclick={nextImage}
                            aria-label="Next image"
                        >
                            <svg viewBox="0 0 24 24" fill="currentColor"
                                ><path
                                    d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"
                                ></path></svg
                            >
                        </button>
                        <!-- Only show dots as a fallback if there are no tabs -->
                        {#if !hasCaptions}
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
                        <div class="layout-group-wrapper">
                            <div class="layout-columns">
                                {#each renderItem.items as value}
                                    <div class="layout-column">
                                        <span class="layout-column-value">
                                            {#if Array.isArray(value)}
                                                {#each value as v}<span
                                                        >{@html v}</span
                                                    >{/each}
                                            {:else}
                                                {@html value}
                                            {/if}
                                        </span>
                                    </div>
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
        transition: color 0.2s ease;
        line-height: 1.2; /* Align emoji better with title */
    }

    .infobox-controls-button:hover,
    .infobox-controls-button:focus-visible {
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

    /* --- Tab Styles --- */
    .carousel-tabs {
        display: flex;
        gap: var(--space-sm);
        border-bottom: 1px solid var(--color-border-primary);
        margin-bottom: var(--space-md);
        overflow-x: auto;
        /* Hide scrollbar for a cleaner look */
        -ms-overflow-style: none; /* IE and Edge */
        scrollbar-width: none; /* Firefox */
    }
    .carousel-tabs::-webkit-scrollbar {
        display: none; /* Chrome, Safari, and Opera */
    }
    .tab {
        background: none;
        border: none;
        padding: var(--space-sm) var(--space-md);
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        border-bottom: 3px solid transparent;
        /* Pull the button up slightly to align with the bottom border */
        margin-bottom: -1px;
        white-space: nowrap;
        transition: all 0.2s ease-in-out;
    }
    .tab:hover {
        color: var(--color-text-primary);
    }
    .tab.active {
        color: var(--color-text-accent);
        border-bottom-color: var(--color-text-accent);
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
        border-bottom: 1px solid var(--color-border-primary);
    }
    .layout-columns {
        display: flex;
        gap: var(--space-sm);
        align-items: flex-start;
        justify-content: space-around;
    }
    .layout-column {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        text-align: left;
    }
    .layout-column-value span {
        /* In case the value is an array, stack the items vertically. */
        display: block;
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
        .infobox-subtitle,
        .carousel-tabs {
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
