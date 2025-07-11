<script lang="ts">
    import { onMount } from "svelte";
    import { checkForAppUpdates } from "$lib/updater";
    import { appStatus, resetAllStores } from "$lib/stores";
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

    let { children } = $props();
    let sidebarWidth = $state(SIDEBAR_INITIAL_WIDTH);
    let isResizing = $state(false);
    let errorMessage = $state<string | null>(null);

    onMount(async () => {
        // --- Initialize Vault ---
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
            errorMessage = e.message || `Failed to read configuration: ${e}`;
            $appStatus = "error";
        }
    });

    async function handleVaultSelected(path: string) {
        errorMessage = null;
        try {
            await initializeVault(path);
            await world.initialize();

            // After the app is ready, check for updates in the background.
            checkForAppUpdates();
        } catch (e: any) {
            errorMessage = e.message;
            $appStatus = "error";
        }
    }

    function handleTryAgain() {
        world.destroy();
        resetAllStores();
        $appStatus = "selecting_vault";
    }

    function startResize() {
        isResizing = true;
        // Add the passive option for better scroll performance during resize.
        window.addEventListener("mousemove", doResize, { passive: true });
        window.addEventListener("mouseup", stopResize);
    }

    function doResize(event: MouseEvent) {
        if (isResizing) {
            const newWidth = event.clientX;
            if (newWidth > SIDEBAR_MIN_WIDTH && newWidth < SIDEBAR_MAX_WIDTH) {
                sidebarWidth = newWidth;
            }
        }
    }

    function stopResize() {
        isResizing = false;
        window.removeEventListener("mousemove", doResize);
        window.removeEventListener("mouseup", stopResize);
    }

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
            src="/compass.svg"
            alt="Compass"
            class="welcome-icon animate-spin"
        />
        <h1 class="welcome-title">Opening Vault...</h1>
    </div>
{:else if $appStatus === "error"}
    <div class="loading-screen">
        <h1 class="welcome-title">Error</h1>
        <p class="error-message">{errorMessage}</p>
        <button class="select-button" onclick={handleTryAgain}
            >Select a Different Folder</button
        >
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
        background-image: url("/parchment.jpg");
        background-size: cover;
        color: var(--ink);
        padding: 2rem;
    }
    .error-message {
        background-color: rgba(139, 0, 0, 0.1);
        color: darkred;
        padding: 1rem;
        border-radius: 4px;
        margin-bottom: 2rem;
        max-width: 600px;
        border: 1px solid rgba(139, 0, 0, 0.2);
    }
    .select-button {
        padding: 0.75rem 1.5rem;
        background-color: var(--accent-color);
        color: var(--parchment);
        border: 1px solid rgba(211, 199, 179, 0.5);
        border-radius: 6px;
        cursor: pointer;
        font-family: "IM Fell English", serif;
        font-size: 1.1rem;
    }
    .chronicler-app {
        display: flex;
        height: 100vh;
        width: 100vw;
        background-image: url("/parchment.jpg");
        background-size: cover;
        color: var(--ink);
        font-family: "IM Fell English", serif;
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
        background: #00000020;
        position: fixed;
        top: 0;
        bottom: 0;
        z-index: 100;
        transition: background-color 0.2s;
    }
    .resizer:hover,
    .resizer:focus {
        background: #00000040;
        outline: none;
    }
    .welcome-icon {
        width: 150px;
        height: 150px;
        opacity: 0.6;
        margin-bottom: 2rem;
    }
    .welcome-title {
        font-family: "Uncial Antiqua", cursive;
        font-size: 4rem;
        margin-bottom: 1rem;
        color: var(--ink-light);
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
