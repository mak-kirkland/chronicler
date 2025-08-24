<script lang="ts">
    import { openUrl } from "@tauri-apps/plugin-opener";
</script>

<div class="welcome-container">
    <div class="welcome-screen">
        <img src="/compass.png" alt="Compass" class="welcome-icon" />
        <h1 class="welcome-title">Chronicler</h1>
        <p class="welcome-text">
            Select a page from the sidebar to begin your journey.
        </p>
    </div>

    <div class="welcome-footer">
        <p>
            🧙‍♂️ Chronicler is in active development. Thank you for trying it out!
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
</div>

<style>
    /* New container to manage layout */
    .welcome-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
    }

    .welcome-screen {
        flex-grow: 1; /* Takes up most of the space */
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        width: 100%;
    }
    .welcome-icon {
        width: 150px;
        height: 150px;
        opacity: 0.8;
        margin-bottom: 2rem;
    }
    .welcome-title {
        font-family: var(--font-family-heading);
        font-size: 4rem;
        margin-bottom: 1rem;
        color: var(--color-text-heading);
    }
    .welcome-text {
        font-size: 1.2rem;
    }
    .welcome-footer {
        flex-shrink: 0; /* Prevents it from shrinking */
        padding: 2rem;
        text-align: center;
        border-top: 1px solid var(--color-border-primary);
        background-color: var(--color-overlay-subtle);
    }
    .welcome-footer p {
        margin: 0.5rem 0;
        font-size: 1rem;
        color: var(--color-text-secondary);
    }
    .welcome-footer a {
        color: var(--color-text-link);
        text-decoration: none;
        border-bottom: 1px dotted var(--color-text-link);
    }
</style>
