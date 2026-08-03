<script lang="ts">
    import { licenseStore } from "$lib/licenseStore";
    import { welcomeBanner } from "$lib/settingsStore";
    import { handleContentClick } from "$lib/actions";
    import { log } from "$lib/logger";
    import { t } from "$lib/i18n";

    let videoReady = $state(false);
    let videoError = $state(false);

    function handleVideoError() {
        log.warn(
            "Video background failed to load, falling back to static image.",
            "WelcomeView",
        );
        videoError = true;
    }

    // Runtime check
    const isLinux =
        typeof navigator !== "undefined" &&
        navigator.userAgent.includes("Linux");

    // Which static hero image to use when the video isn't shown.
    const bannerSrc = $derived(
        $welcomeBanner === "scifi" ? "/scifi-banner.png" : "/banner.png",
    );
</script>

<!--
  The hero fills the pane; the only chrome is a single slim bar at the bottom
  replacing what used to be four emoji paragraphs of community links.
-->
<div class="welcome-container">
    <div class="welcome-screen">
        <div class="hero-banner">
            <!--
               Update Logic:
               Only show video if:
               1. User is licensed
               2. AND User is NOT on Linux (to prevent crashes)
            -->
            {#if $licenseStore.status === "licensed" && !videoError && !isLinux && $welcomeBanner !== "scifi"}
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
                <!-- Fallback for Unlicensed OR Linux users, or when the
                     Sci-Fi banner is selected. -->
                <img src={bannerSrc} alt="Chronicler Banner" />
                <div class="hero-overlay">
                    <h1 class="welcome-title">Chronicler</h1>
                    <p class="welcome-text">
                        {$t("vaultSelector.tagline")}
                    </p>
                </div>
            {/if}
        </div>
    </div>

    <!-- One slim bar, and only for people who haven't bought a licence yet.
         A paying user has already answered the ask; the hero should fill the
         whole pane for them. -->
    {#if $licenseStore.status !== "licensed"}
        <footer class="welcome-footer">
            <span class="footer-note">{$t("welcome.builtBy")}</span>
            <span class="footer-links">
                <a
                    href="https://chronicler.pro/#support"
                    onclick={handleContentClick}
                >
                    {$t("welcome.donate")}
                </a>
                <a
                    href="https://discord.gg/cXJwcbe2b7"
                    onclick={handleContentClick}
                >
                    Discord
                </a>
            </span>
        </footer>
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

        /* This creates an ellipse centered on the right side.
           It keeps the right side opaque (black) and fades smoothly
           to transparent as it reaches the left sidebar and bottom corners.
        */
        mask-image: radial-gradient(
            ellipse at right center,
            black 40%,
            transparent 95%
        );

        -webkit-mask-image: radial-gradient(
            ellipse at right center,
            black 40%,
            transparent 95%
        );
    }

    /* Keep the image always visible (it loads instantly) */
    .hero-banner img {
        opacity: 0.4;
    }

    /* Only show the video when the 'ready' class is added */
    .hero-banner video.ready {
        opacity: 1;
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

    /* --- Footer --- */
    .welcome-footer {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.5rem 1.5rem;
        padding: 0.7rem 34px;
        border-top: 1px solid var(--color-border-primary);
        background-color: var(--color-overlay-subtle);
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        z-index: 2; /* Sit above the hero's absolutely positioned artwork */
    }

    .footer-links {
        display: flex;
        gap: 1.2rem;
    }
</style>
