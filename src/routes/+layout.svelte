<script lang="ts">
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import { checkForAppUpdates } from "$lib/updater";
    import { appStatus, resetAllStores } from "$lib/viewStores";
    import { world } from "$lib/worldStore";
    import { initializeVault } from "$lib/actions";
    import { getVaultPath } from "$lib/commands";
    import VaultSelector from "$lib/components/VaultSelector.svelte";
    import Sidebar from "$lib/components/Sidebar.svelte";
    import ModalManager from "$lib/components/ModalManager.svelte";
    import {
        SIDEBAR_INITIAL_WIDTH,
        SIDEBAR_MIN_WIDTH,
        SIDEBAR_MAX_WIDTH,
        SIDEBAR_KEYBOARD_RESIZE_STEP,
    } from "$lib/config";
    import "../app.css";

    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { openModal } from "$lib/modalStore";
    import DonationModal from "$lib/components/DonationModal.svelte";
    import {
        hideDonationPrompt,
        loadSettings,
        theme,
    } from "$lib/settingsStore";
    import ErrorBox from "$lib/components/ErrorBox.svelte";
    import Button from "$lib/components/Button.svelte";

    let { children } = $props();
    let sidebarWidth = $state(SIDEBAR_INITIAL_WIDTH);
    let isResizing = $state(false);
    let errorMessage = $state<string | null>(null);

    onMount(() => {
        (async () => {
            errorMessage = null;
            try {
                const path = await getVaultPath();
                if (path) {
                    await handleVaultSelected(path);
                } else {
                    $appStatus = "selecting_vault";
                }
            } catch (e: any) {
                console.error("Failed during startup initialization:", e);
                errorMessage =
                    e.message || `Failed to read configuration: ${e}`;
                $appStatus = "error";
            }

            // Load the persistent setting first.
            await loadSettings();

            // Only attach the listener if the user has not opted out.
            if (!get(hideDonationPrompt)) {
                let hasFiredOnce = false;
                const unlisten = await getCurrentWindow().onCloseRequested(
                    async (event) => {
                        if (hasFiredOnce) {
                            return;
                        }
                        event.preventDefault();
                        hasFiredOnce = true;
                        openModal({
                            component: DonationModal,
                            props: {},
                        });
                    },
                );

                return () => {
                    unlisten();
                };
            }
        })();
    });

    // This reactive effect will run whenever the theme store's value changes.
    $effect(() => {
        const currentTheme = $theme;

        // Set the data-theme attribute on the root <html> element.
        // This causes the correct block of CSS variables to be applied.
        if (typeof document !== "undefined") {
            document.documentElement.setAttribute("data-theme", currentTheme);
        }
    });

    /**
     * Handles the logic after a vault path has been selected by the user,
     * either on startup or through the VaultSelector component.
     * @param path The absolute path to the selected vault.
     */
    async function handleVaultSelected(path: string) {
        errorMessage = null;
        try {
            // This initializes the backend and performs the initial file scan.
            await initializeVault(path);
            // This initializes the frontend stores with data from the backend.
            await world.initialize();

            // After the app is ready, check for updates in the background.
            checkForAppUpdates();
        } catch (e: any) {
            errorMessage = e.message;
            $appStatus = "error";
        }
    }

    /** Resets the application state to allow the user to select a new vault. */
    function handleTryAgain() {
        world.destroy();
        resetAllStores();
        $appStatus = "selecting_vault";
    }

    // --- Sidebar Resizing Logic ---

    /** Initiates the sidebar resizing drag operation. */
    function startResize() {
        isResizing = true;
        // Add passive option for better scroll performance during resize.
        window.addEventListener("mousemove", doResize, { passive: true });
        window.addEventListener("mouseup", stopResize); // Ensure it only fires once
    }

    /** Performs the resize operation based on mouse movement. */
    function doResize(event: MouseEvent) {
        if (isResizing) {
            const newWidth = event.clientX;
            if (newWidth > SIDEBAR_MIN_WIDTH && newWidth < SIDEBAR_MAX_WIDTH) {
                sidebarWidth = newWidth;
            }
        }
    }

    /** Stops the resizing drag operation and cleans up event listeners. */
    function stopResize() {
        isResizing = false;
        window.removeEventListener("mousemove", doResize);
        window.removeEventListener("mouseup", stopResize);
    }

    /** Handles resizing the sidebar using the keyboard for accessibility. */
    function handleKeyResize(event: KeyboardEvent) {
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            const newWidth = Math.max(
                SIDEBAR_MIN_WIDTH,
                sidebarWidth - SIDEBAR_KEYBOARD_RESIZE_STEP,
            );
            sidebarWidth = newWidth;
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            const newWidth = Math.min(
                SIDEBAR_MAX_WIDTH,
                sidebarWidth + SIDEBAR_KEYBOARD_RESIZE_STEP,
            );
            sidebarWidth = newWidth;
        }
    }
</script>

<ModalManager />

{#if $appStatus === "selecting_vault"}
    <VaultSelector onVaultSelected={handleVaultSelected} />
{:else if $appStatus === "loading"}
    <div class="loading-screen">
        <img
            src="/compass.png"
            alt="Compass"
            class="welcome-icon animate-spin"
        />
        <h1 class="welcome-title">Opening Vault...</h1>
    </div>
{:else if $appStatus === "error"}
    <div class="loading-screen">
        <h1 class="welcome-title">Error</h1>
        <ErrorBox>{errorMessage}</ErrorBox>
        <Button onclick={handleTryAgain}>Select a Different Folder</Button>
    </div>
{:else if $appStatus === "ready"}
    <div class="chronicler-app" style="--sidebar-width: {sidebarWidth}px">
        <Sidebar bind:width={sidebarWidth} />

        <div
            class="resizer"
            onmousedown={startResize}
            onkeydown={handleKeyResize}
            role="slider"
            tabindex="0"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            aria-valuenow={sidebarWidth}
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            style="left: {sidebarWidth - 2.5}px;"
        ></div>

        <main class="main-content">
            {@render children()}
        </main>
    </div>
{/if}

<style>
    .loading-screen {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        width: 100vw;
        height: 100vh;
        color: var(--color-text-primary);
        padding: 2rem;
    }
    .chronicler-app {
        display: flex;
        height: 100vh;
        width: 100vw;
        color: var(--color-text-primary);
        font-family: var(--font-family-body);
    }
    .main-content {
        display: flex;
        flex-grow: 1;
        height: 100%;
        margin-left: var(--sidebar-width);
    }
    .resizer {
        width: 5px;
        cursor: ew-resize;
        background: var(--color-overlay-resizer);
        position: fixed;
        top: 0;
        bottom: 0;
        z-index: 100;
        transition: background-color 0.2s;
    }
    .resizer:hover,
    .resizer:focus {
        background: var(--color-overlay-resizer-hover);
        outline: none;
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
    .animate-spin {
        animation: spin 2s linear infinite;
    }
    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
</style>
