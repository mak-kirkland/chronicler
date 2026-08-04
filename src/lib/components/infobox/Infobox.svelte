<script lang="ts">
    import { navigateToTag, navigateToImage } from "$lib/actions";
    import { capitalizeFirstLetter } from "$lib/utils";
    import { buildInfoboxLayout, type InfoboxFrontmatter } from "$lib/infobox";
    import ErrorBox from "$lib/components/ui/ErrorBox.svelte";
    import { openModal, closeModal } from "$lib/modalStore";
    import { areInfoboxTagsVisible } from "$lib/settingsStore";
    import InfoboxSettingsModal from "$lib/components/infobox/InfoboxSettingsModal.svelte";
    import Carousel from "$lib/components/ui/Carousel.svelte";
    import Icon from "$lib/components/ui/Icon.svelte";
    import { t } from "$lib/i18n";

    // --- Props ---
    let {
        data,
        onEdit,
        fallbackTitle = "",
    } = $props<{
        data: InfoboxFrontmatter | null;
        onEdit?: () => void;
        fallbackTitle?: string;
    }>();

    // The displayed title: explicit YAML `title` takes priority, then the
    // fallback inferred from the file name by the parent component.
    const displayTitle = $derived(data?.title || fallbackTitle);

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
                displayTitle ||
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

    /**
     * Whether a value should be set in lining figures. Populations and dates
     * are the common case, and ragged proportional digits down a column of
     * numbers are what make a record card look like a form.
     */
    const NUMERIC_VALUE = /^[\s\d.,+\-–—%]+$/;
    function isNumericValue(value: unknown): boolean {
        if (typeof value === "number") return true;
        return (
            typeof value === "string" &&
            value.trim() !== "" &&
            NUMERIC_VALUE.test(value)
        );
    }
</script>

<div class="infobox">
    <!-- 1. Title band. The accent tint is the separator; a rule here would be
         the first of six stacking hairlines. -->
    <div class="title-band">
        <div class="title-text">
            {#if displayTitle}
                <h3 class="infobox-title">{@html displayTitle}</h3>
            {/if}
            {#if data?.subtitle}
                <p class="infobox-subtitle">{@html data.subtitle}</p>
            {/if}
        </div>

        <div class="controls-group">
            <!--
                The Edit button now delegates to the parent via onEdit.
                This ensures we edit the live content, not stale disk content.
            -->
            {#if onEdit}
                <button
                    class="infobox-controls-button"
                    onclick={onEdit}
                    title={$t("editor.editInfobox")}
                >
                    <Icon type="edit" />
                </button>
            {/if}
            <button
                class="infobox-controls-button"
                onclick={openSettingsModal}
                title={$t("infobox.settingsTitle")}
            >
                <Icon type="settings" />
            </button>
        </div>
    </div>

    <div class="card-body">
        <!--
            We use the shared Carousel component.
            - stripFooter puts the caption and paging dots in one strip under
              the image, which is what makes a multi-image card read as a set.
            - onImageClick: Handles the click event for the lightbox.
        -->
        {#if carouselImages.length > 0}
            <div class="image-column">
                <Carousel
                    images={carouselImages}
                    className="infobox-carousel tabbed"
                    stripFooter
                    onImageClick={openImageView}
                />
            </div>
        {/if}

        <div class="data-column">
            {#if data?.error}
                <ErrorBox title={$t("infobox.yamlParseError")}
                    >{data.details || data.error}</ErrorBox
                >
            {/if}

            <!-- The card's sub-header — what kind of record this is. It names
                 the whole card, unlike the section headers below it, so it is
                 the one thing here that takes the accent. -->
            {#if data?.infobox}
                <h4 class="card-subheader">{@html data.infobox}</h4>
            {/if}

            <!-- The main definition list for key-value pairs. -->
            <dl>
                <!-- This loop iterates over the final, processed list of render items. -->
                {#each renderItems as renderItem, i (`${renderItem.type}-${i}`)}
                    {#if renderItem.type === "header"}
                        <!-- An eyebrow and a rule that fills the rest of the
                             width: it labels the group without drawing another
                             full-width line across the card. -->
                        <div class="section-head">
                            <span class="eyebrow">{@html renderItem.text}</span>
                            <span class="section-rule" aria-hidden="true"
                            ></span>
                        </div>
                    {:else if renderItem.type === "separator"}
                        <!-- Sections now do most of this job, but an explicit
                             `separator` layout rule is the user asking for a
                             break, so it still draws — just quietly. -->
                        <hr class="layout-separator" />
                    {:else if renderItem.type === "columns"}
                        <!-- Columns span the full width to contain their own layout. -->
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
                        <dt class="eyebrow">
                            {@html capitalizeFirstLetter(key)}
                        </dt>
                        <dd class:numeric={isNumericValue(value)}>
                            {#if Array.isArray(value)}
                                <!-- Inline rather than a bullet list: three
                                     bullets in a 20rem card cost four lines to
                                     say what one line says. -->
                                {#each value as item, j (`${item}-${j}`)}
                                    {#if j > 0}<span class="list-sep"
                                            >,
                                        </span>{/if}{@html item}
                                {/each}
                            {:else}
                                {@html value}
                            {/if}
                        </dd>
                    {/if}
                {/each}
            </dl>

            {#if data && !data.error && renderItems.length === 0 && (!data.tags || data.tags.length === 0 || !$areInfoboxTagsVisible)}
                <div class="no-fields-message text-muted text-center">
                    {$t("infobox.noAdditionalFields")}
                </div>
            {/if}
        </div>
    </div>

    <!-- Tags are rendered conditionally based on the global store. They sit in
         their own band rather than in the field grid: a tag is not a field. -->
    {#if $areInfoboxTagsVisible}
        {#if data?.tags && Array.isArray(data.tags) && data.tags.length > 0}
            <div class="tags-band">
                <!--
                  Add unique key to prevent error from duplicate tags in its frontmatter.
                -->
                {#each data.tags as tag, i (`${tag}-${i}`)}
                    <button
                        class="tag-pill tag-link"
                        onclick={() => navigateToTag(tag)}
                    >
                        #{tag}
                    </button>
                {/each}
            </div>
        {/if}
    {/if}
</div>

<style>
    /* One surface, one colour. The card's regions are told apart by spacing and
       by the few hairlines that survive — giving each of them its own fill
       turned a record into a stack of differently-shaded strips, which is
       busier than the thing it was meant to organise. */
    .infobox {
        background-color: var(--color-overlay-light);
        border: 1px solid var(--color-border-primary);
        border-radius: 8px;
        overflow: hidden;
        font-size: 0.9rem;
        container-type: inline-size;
    }

    /* --- Title --- */
    .title-band {
        display: flex;
        align-items: flex-start;
        gap: var(--space-sm);
        padding: 0.7rem 0.9rem 0.75rem;
    }

    .title-text {
        flex-grow: 1;
        min-width: 0;
    }

    /* The card renders inside .chronicler-content, so preview.css's in-article
       h3 rule reaches this title and would draw a rule under it — the card has
       its own structure and does not need the article's. */
    .infobox-title {
        font-family: var(--font-family-heading);
        font-size: 1.15rem;
        font-weight: 400;
        color: var(--color-text-heading);
        margin: 0;
        padding-bottom: 0;
        border-bottom: none;
        line-height: 1.25;
    }

    .infobox-subtitle {
        font-size: 0.85rem;
        font-style: italic;
        color: var(--color-text-secondary);
        /* The old rule pulled this up under the header's border with a negative
           margin. There is no border to tuck under now. */
        margin: 2px 0 0;
        padding: 0;
    }

    .controls-group {
        display: flex;
        gap: 0.35rem;
        flex-shrink: 0;
    }

    .infobox-controls-button {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        font-size: 1.1rem;
        color: var(--color-text-secondary);
        flex-shrink: 0;
        transition:
            color 0.2s ease,
            opacity 0.2s ease;
        line-height: 1.2;
        opacity: 0;
    }

    /* Reveal the buttons when hovering over the title band. */
    .title-band:hover .infobox-controls-button {
        opacity: 1;
    }

    .infobox-controls-button:hover,
    .infobox-controls-button:focus-visible {
        opacity: 1;
        color: var(--color-text-primary);
        outline: none;
    }

    /* --- Image --- */
    /* Flush to the card's edges: a padded, rounded image inside a rounded card
       is two frames doing one job. */
    .image-column {
        width: 100%;
    }

    /* --- Fields --- */
    .data-column {
        padding: 0.7rem 0.9rem 0.85rem;
        min-width: 0;
    }

    .no-fields-message {
        padding: var(--space-sm);
    }

    /* Names the whole card, so it outranks the field labels and the section
       headers below it — but it sits under the card's own title, so it takes
       the heading colour a step down in size rather than competing with it. */
    .card-subheader {
        font-family: var(--font-family-heading);
        font-size: 0.9rem;
        font-weight: 400;
        color: var(--color-text-heading);
        margin: 0 0 0.6rem;
        padding-bottom: 0.35rem;
        border-bottom: 1px solid var(--hairline-soft);
    }

    .section-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
    }

    .section-head .eyebrow {
        flex-shrink: 0;
    }

    .section-rule {
        flex: 1;
        height: 1px;
        background: var(--hairline-soft);
    }

    /* Sections after the first need air above them. */
    dl .section-head {
        grid-column: 1 / -1;
        margin: 14px 0 6px;
    }

    dl .section-head:first-child {
        margin-top: 0;
    }

    dl {
        display: grid;
        grid-template-columns: 7rem 1fr;
        align-items: baseline;
        margin: 0;
    }

    /* The single biggest change in the card: labels are eyebrows, not bold
       dark text competing with the values they introduce. */
    dt {
        padding: 6px 0;
        min-width: 0;
        overflow-wrap: anywhere;
    }

    dd {
        margin: 0;
        padding: 6px 0;
        font-size: 0.95rem;
        min-width: 0;
        overflow-wrap: anywhere;
    }

    dd.numeric {
        font-variant-numeric: tabular-nums;
    }

    .list-sep {
        color: var(--color-text-secondary);
    }

    .infobox :global(.embedded-image) {
        height: 1.2em;
        vertical-align: middle;
        margin-right: var(--space-xs);
    }

    /* --- Tags footer ---
       A rule and some space, not a shaded strip. Tags are still not a field,
       which is the point of separating them at all. */
    .tags-band {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-sm);
        padding: 0.6rem 0.9rem;
        border-top: 1px solid var(--hairline-soft);
    }

    /* .tag-link extends global .tag-pill with interactivity */
    .tag-link {
        cursor: pointer;
        background-color: var(--color-background-tertiary);
        border: 1px solid
            color-mix(in srgb, var(--color-border-primary) 80%, transparent);
        border-radius: 99px;
        padding: 0.15rem 0.55rem;
        font-size: 0.75rem;
        text-align: left;
        word-break: break-word;
    }
    .tag-link:hover,
    .tag-link:focus {
        border-color: var(--color-accent-primary);
        outline: none;
    }

    /* --- User-defined Layout Styles --- */
    .layout-separator {
        grid-column: 1 / -1;
        border: none;
        border-top: 1px solid var(--hairline-faint);
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
        width: 100%;
    }

    /* The card's own border draws the sides; the image supplies the horizontal
       rules that separate it from the title band and from the fields. */
    :global(.content-carousel.infobox-carousel .carousel-stack) {
        border: none;
        border-block: 1px solid var(--color-border-primary);
        border-radius: 0;
    }

    /* Caption tabs, when every image has one. They sit between the title and
       the flush image, so they lose their own bottom rule — the image draws
       it — and keep the card's single background. */
    :global(.content-carousel.infobox-carousel .carousel-tabs) {
        margin-bottom: 0;
        padding: 0 0.4rem;
        gap: 0;
        border-bottom: none;
        border-top: 1px solid var(--hairline-soft);
    }

    :global(.content-carousel.infobox-carousel .tab) {
        padding: 5px 6px;
        font-size: 0.7rem;
        font-weight: 500;
        margin-bottom: 0;
        border-bottom-width: 2px;
    }

    /* Contained, never cropped: an infobox image is usually a portrait or a
       crest, and cropping one to a fixed band cuts heads off. The carousel's
       blurred backdrop fills whatever the aspect ratio leaves over. */
    :global(.content-carousel.infobox-carousel .image-wrapper img) {
        width: 100%;
        height: auto;
        max-height: 400px;
        object-fit: contain;
        box-shadow: none;
    }

    /* --- Container Query for responsive layout --- */
    /* Stacked, the card costs ~420px of vertical space; side by side, ~200px.
       Once the card is wide enough (it unfloats to the full column width in a
       narrow pane) the image and the fields sit next to each other. */
    @container (width > 480px) {
        .card-body {
            display: flex;
            align-items: stretch;
        }
        .image-column {
            width: 44%;
            flex-shrink: 0;
            align-self: stretch;
            min-height: 168px;
            border-right: 1px solid var(--color-border-primary);
        }
        :global(.content-carousel.infobox-carousel .image-wrapper img) {
            max-height: 100%;
        }
        :global(.content-carousel.infobox-carousel) {
            height: 100%;
        }
        :global(.content-carousel.infobox-carousel .carousel-stack) {
            border-block: none;
            border-top: 1px solid var(--color-border-primary);
            height: 100%;
        }
        .data-column {
            flex: 1;
            min-width: 0;
            border-top: 1px solid var(--color-border-primary);
        }
        dl {
            grid-template-columns: 6.5rem 1fr;
            align-content: start;
        }
    }
</style>
