<script lang="ts">
    let {
        images,
        className = "",
        mode = "standard",
        onImageClick = undefined,
    } = $props<{
        images: {
            src: string;
            alt: string;
            title?: string;
            caption?: string;
        }[];
        className?: string;
        mode?: "standard" | "infobox";
        onImageClick?: (index: number) => void;
    }>();

    let currentImageIndex = $state(0);
    const currentCaption = $derived(images[currentImageIndex]?.caption);

    function nextImage(e: Event) {
        e.stopPropagation();
        currentImageIndex = (currentImageIndex + 1) % images.length;
    }

    function prevImage(e: Event) {
        e.stopPropagation();
        currentImageIndex =
            (currentImageIndex - 1 + images.length) % images.length;
    }

    function goToImage(index: number) {
        currentImageIndex = index;
    }

    function handleImageClick(index: number) {
        if (onImageClick) {
            onImageClick(index);
        }
    }

    // Only show tabs if we are in 'infobox' mode AND have valid captions.
    const showTabs = $derived(
        mode === "infobox" &&
            images.length > 1 &&
            images.every((img: any) => img.caption && img.caption.length > 0),
    );
</script>

<!--
    We automatically apply 'infobox-carousel' class if mode is infobox.
    We append {className} for ad-hoc utilities like 'small' or 'large'.
-->
<div
    class="content-carousel {className}"
    class:infobox-carousel={mode === "infobox"}
>
    <!-- Render Image Tabs if enabled -->
    {#if showTabs}
        <div class="carousel-tabs">
            {#each images as img, i}
                <button
                    class="tab"
                    class:active={currentImageIndex === i}
                    onclick={(e) => {
                        e.stopPropagation();
                        goToImage(i);
                    }}
                >
                    {@html img.caption}
                </button>
            {/each}
        </div>
    {/if}

    <div class="carousel-stack">
        {#each images as image, i}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="image-wrapper"
                class:active={i === currentImageIndex}
                class:clickable={!!onImageClick}
                aria-hidden={i !== currentImageIndex}
                onclick={() => handleImageClick(i)}
            >
                <!-- Blurred background to fill gaps/maintain aesthetics -->
                <div
                    class="blurred-bg"
                    style:background-image="url('{image.src}')"
                ></div>

                <img src={image.src} alt={image.alt} title={image.title} />
            </div>
        {/each}

        {#if images.length > 1}
            <button
                class="carousel-button prev"
                onclick={prevImage}
                aria-label="Previous image"
            >
                <svg viewBox="0 0 24 24" fill="currentColor"
                    ><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                    ></path></svg
                >
            </button>
            <button
                class="carousel-button next"
                onclick={nextImage}
                aria-label="Next image"
            >
                <svg viewBox="0 0 24 24" fill="currentColor"
                    ><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"
                    ></path></svg
                >
            </button>

            <!-- Show dots if we aren't showing tabs -->
            {#if !showTabs}
                <div class="carousel-dots">
                    {#each images as _, i}
                        <button
                            class="dot"
                            class:active={currentImageIndex === i}
                            onclick={(e) => {
                                e.stopPropagation();
                                currentImageIndex = i;
                            }}
                            aria-label="Go to image {i + 1}"
                        ></button>
                    {/each}
                </div>
            {/if}
        {/if}
    </div>

    <!-- Show caption below image if it exists AND we aren't using tabs mode -->
    {#if currentCaption && !showTabs}
        <div class="carousel-caption">
            {@html currentCaption}
        </div>
    {/if}
</div>

<style>
    :root {
        --control-size: 2rem; /* 32px */
        --icon-size: 1.5rem; /* 24px */
        --dot-size: 0.625rem; /* 10px */
        --gallery-height: 300px; /* Default */

        /* Layout spacing variables */
        --space-xs: 0.25rem;
        --space-sm: 0.5rem;
        --space-md: 1rem;
    }

    .content-carousel {
        margin-block: 1.5em;
        display: flex;
        flex-direction: column;

        /* Shrink the container to match the width of the image stack */
        width: fit-content;
        max-width: 100%;
    }

    /* --- Sizing Helpers --- */
    .content-carousel.small {
        --gallery-height: 150px;
    }
    .content-carousel.large {
        --gallery-height: 450px;
    }

    /* Infobox specific sizing override via logic-bound class */
    .content-carousel.infobox-carousel {
        margin-block: 0;
        margin-bottom: var(--space-md);
        width: 100%; /* Ensure it fills the infobox column */
    }

    .content-carousel.infobox-carousel img {
        width: 100%;
        height: auto;
        max-height: 400px; /* Match old Infobox limit */
        object-fit: contain;
    }

    /* Remove the boxy look for infoboxes so empty space (bars) is transparent/invisible */
    .content-carousel.infobox-carousel .carousel-stack {
        border: none;
        background-color: transparent;
        border-radius: 4px; /* Keep radius on the image itself */
    }

    .content-carousel.infobox-carousel .carousel-stack img {
        border-radius: 4px;
    }

    .carousel-stack {
        display: grid;
        grid-template-columns: 1fr;
        grid-template-rows: 1fr;
        position: relative;
        border: 1px solid var(--color-border-primary);
        border-radius: 4px;
        overflow: hidden;
        background-color: var(--color-background-secondary);
        width: 100%;
    }

    .image-wrapper {
        grid-area: 1 / 1; /* Stack all images on top of each other */
        opacity: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 0;
        /* Ensure wrapper doesn't constrain height artificially */
        height: 100%;
        position: relative; /* Context for absolute blurred bg */
        overflow: hidden; /* Clip blurred edges */
        pointer-events: none; /* Let clicks pass through if inactive */
        transition: opacity 0.2s ease-in-out;
    }

    .image-wrapper.active {
        opacity: 1;
        position: relative;
        z-index: 1;
        pointer-events: auto; /* Re-enable pointer events for active slide */
    }

    .image-wrapper.clickable {
        cursor: pointer;
    }

    /* The frosted glass effect background */
    .blurred-bg {
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: center;
        filter: blur(20px) brightness(0.7);
        transform: scale(1.2); /* Scale up to hide blur vignette edges */
        z-index: 0;
        opacity: 0.8;
    }

    img {
        display: block;
        height: var(--gallery-height);
        width: auto;
        max-width: 100%;
        object-fit: contain;
        position: relative;
        z-index: 1; /* Sit above the blur */
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }

    /* --- Caption Styles --- */
    .carousel-caption {
        margin-top: 0.5rem;
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        text-align: center; /* Center text relative to the IMAGE now */

        /* Prevent the caption text from expanding the container width.
           This forces the text to wrap to the width established by the image.
        */
        width: 0;
        min-width: 100%;
    }

    /* --- Controls --- */
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

    .carousel-stack:hover .carousel-button {
        opacity: 1;
    }

    .carousel-button:hover {
        background-color: hsla(0, 0%, 0%, 0.6);
    }

    .carousel-button.prev {
        left: 0.5rem;
    }

    .carousel-button.next {
        right: 0.5rem;
    }

    .carousel-button svg {
        width: var(--icon-size);
        height: var(--icon-size);
    }

    .carousel-dots {
        position: absolute;
        bottom: 0.5rem;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 0.5rem;
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

    /* --- Tab Styles (Moved from Infobox) --- */
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
        color: var(--color-accent-primary);
        border-bottom-color: var(--color-text-accent);
    }
</style>
