<script lang="ts">
    let { images, className = "" } = $props<{
        images: {
            src: string;
            alt: string;
            title?: string;
            caption?: string;
        }[];
        className?: string;
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
</script>

<div class="content-carousel {className}">
    <div class="carousel-stack">
        {#each images as image, i}
            <div
                class="image-wrapper"
                class:active={i === currentImageIndex}
                aria-hidden={i !== currentImageIndex}
            >
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
    </div>

    {#if currentCaption}
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
        transition: opacity 0.3s ease-in-out;
        pointer-events: none;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 0;
    }

    .image-wrapper.active {
        opacity: 1;
        position: relative;
        z-index: 1;
        pointer-events: auto;
    }

    img {
        display: block;
        height: var(--gallery-height);
        width: auto;
        max-width: 100%;
        object-fit: contain;
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
</style>
