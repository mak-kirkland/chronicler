<script lang="ts">
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { licenseStore } from "$lib/licenseStore";

    let videoReady = false;
    let videoError = false;

    function handleVideoError() {
        console.warn(
            "Video background failed to load, falling back to static image.",
        );
        videoError = true;
    }
</script>

<div class="welcome-container">
    <div class="welcome-screen">
        <div class="hero-banner">
            {#if $licenseStore.status === "licensed" && !videoError}
                <video
                    src="/background.webm"
                    width="100%"
                    height="100%"
                    autoplay
                    muted
                    loop
                    playsinline
                    class:ready={videoReady}
                    onloadedmetadata={() => (videoReady = true)}
                    onerror={handleVideoError}
                >
                </video>
            {:else}
                <img src="/banner.png" alt="Chronicler Banner" />
                <div class="hero-overlay">
                    <h1 class="welcome-title">Chronicler</h1>
                    <p class="welcome-text">
                        Your digital scriptorium — where knowledge links
                        together.
                    </p>
                </div>
            {/if}
        </div>
    </div>

    {#if $licenseStore.status !== "licensed"}
        <div class="welcome-footer">
            <p>
                🧙‍♂️ Chronicler is in active development. Thank you for trying it
                out!
            </p>
            <p>
                ❤️ If you find this app useful, please consider
                <a
                    href="https://chronicler.pro/#support"
                    onclick={(event) => {
                        event.preventDefault();
                        openUrl("https://chronicler.pro/#support");
                    }}>supporting its development</a
                >. Thanks! :)
            </p>
            <p>
                💬 Join the community on <a
                    href="https://discord.gg/cXJwcbe2b7"
                    onclick={(event) => {
                        event.preventDefault();
                        openUrl("https://discord.gg/cXJwcbe2b7");
                    }}>Discord</a
                > to ask questions and share your work.
            </p>
            <p>
                🐞 Found a bug? Have a feature request? Please <a
                    href="https://github.com/mak-kirkland/chronicler/issues"
                    onclick={(event) => {
                        event.preventDefault();
                        openUrl(
                            "https://github.com/mak-kirkland/chronicler/issues",
                        );
                    }}>open an issue on GitHub.</a
                >
            </p>
        </div>
    {/if}
</div>

<style>
    .welcome-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background-color: var(--color-background-primary);
        overflow: hidden; /* Prevent main scrollbar */
    }

    .welcome-screen {
        flex-grow: 1; /* Takes up most of the space */
        display: flex;
        flex-direction: column;
        width: 100%;
        position: relative;
        overflow: hidden;
    }

    .hero-banner {
        position: relative;
        width: 100%;
        height: 100%; /* Fill the available space above footer */
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }

    .hero-banner :is(img, video) {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;

        /* Start invisible */
        opacity: 0;
        transition: opacity 0.4s ease-out; /* Smooth fade-in */
        will-change: opacity;
    }

    /* Keep the image always visible (it loads instantly) */
    .hero-banner img {
        opacity: 0.4;
    }

    /* Only show the video when the 'ready' class is added */
    .hero-banner video.ready {
        opacity: 1;
    }

    /* Gradient Overlay:
       1. Fades to background color at the bottom (vertical fade).
       2. Fades to background color on the left (horizontal fade).
       This creates a smooth "L" shaped blend into the UI.
    */
    .hero-banner::after {
        content: "";
        position: absolute;
        inset: 0; /* Covers the entire container */
        background:
            linear-gradient(
                to bottom,
                transparent 50%,
                var(--color-background-primary) 100%
            ),
            linear-gradient(
                to right,
                var(--color-background-primary) 0%,
                transparent 30%
            );
        pointer-events: none;
    }

    .hero-overlay {
        position: relative; /* Sit above the image */
        z-index: 1;
        text-align: center;
        padding: 2rem;
        max-width: 800px;
    }

    .welcome-title {
        font-family: var(--font-family-heading);
        font-size: 5rem;
        margin: 0 0 1rem 0;
        color: var(--color-text-heading);
        text-shadow: 0 4px 12px var(--color-background-primary); /* Shadow for contrast */
    }

    .welcome-text {
        font-size: 1.6rem;
        color: var(--color-text-primary);
        text-shadow: 0 2px 6px var(--color-background-primary);
    }

    .welcome-footer {
        flex-shrink: 0;
        padding: 1.5rem;
        text-align: center;
        border-top: 1px solid var(--color-border-primary);
        background-color: var(--color-overlay-subtle);
        z-index: 2; /* Ensure footer sits above any absolute positioning */
    }

    .welcome-footer p {
        margin: 0.25rem 0;
        font-size: 0.95rem;
        color: var(--color-text-secondary);
    }

    .welcome-footer a {
        color: var(--color-text-link);
        text-decoration: none;
        border-bottom: 1px dotted var(--color-text-link);
    }
</style>
