<script lang="ts">
    import { currentView, fileViewMode, rightSidebar } from "$lib/viewStores";
    import TagIndexView from "$lib/components/TagIndexView.svelte";
    import FileView from "$lib/components/FileView.svelte";
    import ImageView from "$lib/components/ImageView.svelte";
    import BacklinksPanel from "$lib/components/BacklinksPanel.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";

    // This effect resets the file view mode and hides the right sidebar
    // whenever the user navigates away from the file view.
    $effect(() => {
        if ($currentView.type !== "file") {
            $fileViewMode = "preview";
            rightSidebar.update((state) => ({ ...state, isVisible: false }));
        }
    });
</script>

{#if $currentView.type === "welcome"}
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
                🧙‍♂️ Chronicler is in active development. Thank you for trying it
                out!
            </p>
            <p>
                🙏 If you find this app useful, please consider <b
                    >supporting its development</b
                >
                on
                <a
                    href="https://patreon.com/ChroniclerNotes"
                    onclick={(event) => {
                        event.preventDefault();
                        openUrl("https://patreon.com/ChroniclerNotes");
                    }}>Patreon</a
                >
                or
                <a
                    href="https://buymeacoffee.com/chronicler"
                    onclick={(event) => {
                        event.preventDefault();
                        openUrl("https://buymeacoffee.com/chronicler");
                    }}>Buy Me a Coffee</a
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
{:else if $currentView.type === "tag"}
    <TagIndexView name={$currentView.tagName} />
{:else if $currentView.type === "file" && $currentView.data}
    <FileView file={$currentView.data} />
{:else if $currentView.type === "image" && $currentView.data}
    <ImageView data={$currentView.data} />
{/if}

{#if $rightSidebar.isVisible}
    <BacklinksPanel />
{/if}

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
        color: var(--ink-heading);
    }
    .welcome-text {
        font-size: 1.2rem;
    }
    .welcome-footer {
        flex-shrink: 0; /* Prevents it from shrinking */
        padding: 2rem;
        text-align: center;
        border-top: 1px solid var(--border-color);
        background-color: var(--color-overlay-subtle);
    }
    .welcome-footer p {
        margin: 0.5rem 0;
        font-size: 1rem;
        color: var(--ink-light);
    }
    .welcome-footer a {
        color: var(--color-text-link);
        text-decoration: none;
        border-bottom: 1px dotted var(--color-text-link);
    }
</style>
