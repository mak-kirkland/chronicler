<script lang="ts">
    import { onMount } from "svelte";
    import { getVersion } from "@tauri-apps/api/app";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import Modal from "./Modal.svelte";
    import Button from "./Button.svelte";

    let { onClose } = $props<{ onClose: () => void }>();

    let appVersion = $state<string>("Unknown");

    onMount(async () => {
        try {
            appVersion = await getVersion();
        } catch (e) {
            console.error("Failed to get app version:", e);
        }
    });
</script>

<Modal title="About Chronicler" {onClose}>
    <div class="about-container">
        <img src="/logo.png" alt="Chronicler Logo" class="app-logo" />

        <div class="app-info">
            <h2 class="app-name">Chronicler</h2>
            <p class="app-version">Version {appVersion}</p>
            <p class="app-description">
                A powerful, offline worldbuilding tool for writers and GMs.
            </p>
        </div>

        <div class="credits-section">
            <h3>Credits</h3>

            <div class="credit-group">
                <h4>Concept & Development</h4>
                <p>Michael Kirkland</p>
            </div>

            <div class="credit-group">
                <h4>Artwork</h4>
                <p>
                    Banner by
                    <button
                        class="link-btn"
                        onclick={() =>
                            openUrl("https://www.youtube.com/@SigmaeusDrafts")}
                    >
                        Sigmaeus
                    </button>
                </p>
            </div>

            <div class="credit-group">
                <h4>Special Thanks</h4>
                <p>To the wonderful Discord community and early supporters.</p>
            </div>
        </div>

        <div class="links-section">
            <Button onclick={() => openUrl("https://chronicler.pro")}
                >Website</Button
            >
            <Button
                onclick={() =>
                    openUrl("https://github.com/mak-kirkland/chronicler")}
                >GitHub</Button
            >
            <Button onclick={() => openUrl("https://discord.gg/cXJwcbe2b7")}
                >Discord</Button
            >
        </div>

        <div class="footer">
            <p>
                © {new Date().getFullYear()} Michael Kirkland. All rights reserved.
            </p>
        </div>
    </div>
</Modal>

<style>
    .about-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 1.5rem;
        /* Ensure content doesn't force horizontal scroll */
        width: 100%;
        box-sizing: border-box;
    }

    .app-logo {
        width: 80px;
        height: 80px;
        border-radius: 16px;
        box-shadow: 0 4px 12px var(--color-overlay-subtle);
    }

    .app-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        width: 100%;
    }

    .app-name {
        font-family: var(--font-family-heading);
        font-size: 2rem;
        margin: 0;
        color: var(--color-text-heading);
    }

    .app-version {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        margin: 0;
    }

    .app-description {
        font-size: 1rem;
        /* Removed fixed max-width that caused squishing */
        margin: 0.5rem 0 0 0;
        line-height: 1.5;
        padding: 0 1rem;
    }

    .credits-section {
        width: 100%;
        background-color: var(--color-background-secondary);
        border-radius: 8px;
        padding: 1.5rem; /* Increased padding for better spacing */
        text-align: left;
        border: 1px solid var(--color-border-primary);
        box-sizing: border-box; /* Include padding in width calculation */
    }

    .credits-section h3 {
        margin-top: 0;
        margin-bottom: 1rem;
        border-bottom: 1px solid var(--color-border-primary);
        padding-bottom: 0.5rem;
        font-size: 1.1rem;
    }

    .credit-group {
        margin-bottom: 1rem;
    }

    .credit-group:last-child {
        margin-bottom: 0;
    }

    .credit-group h4 {
        margin: 0 0 0.25rem 0;
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .credit-group p {
        margin: 0;
        font-size: 0.95rem;
    }

    .link-btn {
        background: none;
        border: none;
        padding: 0;
        color: var(--color-text-link);
        text-decoration: underline;
        cursor: pointer;
        font: inherit;
    }

    .link-btn:hover {
        color: var(--color-text-primary);
    }

    .links-section {
        display: flex;
        gap: 1rem;
        justify-content: center;
        flex-wrap: wrap;
        width: 100%;
    }

    .footer {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        margin-top: 0.5rem;
    }
</style>
