<script lang="ts">
    import {
        SIDEBAR_MIN_WIDTH,
        SIDEBAR_MAX_WIDTH,
        SIDEBAR_KEYBOARD_RESIZE_STEP,
    } from "$lib/config";
    import { appStatus } from "$lib/appState";
    import {
        initializeApp,
        selectNewVault,
        handleVaultSelected,
    } from "$lib/startup";
    import {
        activeTheme,
        fontSize,
        userThemes,
        themeRefresher,
        sidebarWidth,
        headingFont,
        bodyFont,
        atmosphere,
        atmosphereMode,
    } from "$lib/settingsStore";
    import { THEME_PALETTE_KEYS } from "$lib/themeRegistry";
    import { licenseStore } from "$lib/licenseStore";
    import { openModal } from "$lib/modalStore";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { initializeKeybindings } from "$lib/keybindings";

    // Import UI Components
    import VaultSelector from "$lib/components/views/VaultSelector.svelte";
    import Sidebar from "$lib/components/sidebar/Sidebar.svelte";
    import ModalManager from "$lib/components/modals/ModalManager.svelte";
    import ErrorBox from "$lib/components/ui/ErrorBox.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import DonationModal from "$lib/components/modals/DonationModal.svelte";
    import AtmosphereEffects from "$lib/components/ui/AtmosphereEffects.svelte";

    import "../app.css";
    import "../preview.css";
    import "$lib/atmosphere/index.css";

    let { children } = $props();
    let isResizing = $state(false);

    // --- App Initialization & Global Listeners ---
    $effect(() => {
        // Kick off the main application startup sequence once.
        initializeApp();

        // Initialize global keybindings and get the cleanup function.
        const destroyKeybindings = initializeKeybindings();

        // The effect's cleanup function will run when the component is destroyed.
        return () => {
            destroyKeybindings();
        };
    });

    // --- Donation Prompt on Close ---
    $effect(() => {
        // This effect handles the window close listener and its cleanup.
        if (
            $licenseStore.status === "licensed" ||
            typeof window === "undefined"
        ) {
            return;
        }

        let hasFiredOnce = false;
        const appWindow = getCurrentWindow();
        const unlistenPromise = appWindow.onCloseRequested(async (event) => {
            if (hasFiredOnce) return;
            event.preventDefault();
            hasFiredOnce = true;
            openModal({ component: DonationModal, props: {} });
        });

        // The effect's cleanup function will run when the component is destroyed.
        return () => {
            unlistenPromise.then((unlisten) => unlisten());
        };
    });

    // --- Consolidated Document Style Effect ---
    // This single effect handles all styles applied to the root document to
    // prevent them from conflicting with each other.
    $effect(() => {
        // Subscribe to the refresher. This forces the effect to re-run on demand.
        $themeRefresher;

        if (typeof document !== "undefined") {
            const root = document.documentElement;
            const style = root.style;
            const themeName = $activeTheme;
            const customTheme = $userThemes.find((t) => t.name === themeName);

            // --- A. Apply Font Size & Typography (Now Independent of Theme) ---
            style.fontSize = `${$fontSize}%`;
            style.setProperty("--font-family-heading", $headingFont);
            style.setProperty("--font-family-body", $bodyFont);

            // --- B. Apply Theme Colors ---
            if (customTheme) {
                // It's a custom theme.
                root.removeAttribute("data-theme");

                // Apply color palette
                for (const [key, value] of Object.entries(
                    customTheme.palette,
                )) {
                    style.setProperty(key, value);
                }
            } else {
                // It's a built-in theme.
                root.setAttribute("data-theme", themeName || "light");

                // CRITICAL: Clean up any lingering variables from a previous custom theme.
                for (const varName of THEME_PALETTE_KEYS) {
                    style.removeProperty(varName);
                }
            }
        }
    });

    /** Resets the application state to allow the user to select a new vault. */
    function handleTryAgain() {
        selectNewVault();
    }

    // --- Sidebar Resizing Logic ---

    /** Initiates the sidebar resizing drag operation. */
    function startResize() {
        isResizing = true;
        // Add passive option for better scroll performance during resize.
        window.addEventListener("mousemove", doResize, { passive: true });
        window.addEventListener("mouseup", stopResize, { once: true });
    }

    /** Performs the resize operation based on mouse movement. */
    function doResize(event: MouseEvent) {
        if (isResizing) {
            const newWidth = event.clientX;
            if (
                newWidth >= SIDEBAR_MIN_WIDTH &&
                newWidth <= SIDEBAR_MAX_WIDTH
            ) {
                $sidebarWidth = newWidth;
            }
        }
    }

    /** Stops the resizing drag operation and cleans up event listeners. */
    function stopResize() {
        isResizing = false;
        window.removeEventListener("mousemove", doResize);
    }

    /** Handles resizing the sidebar using the keyboard for accessibility. */
    function handleKeyResize(event: KeyboardEvent) {
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            const newWidth = Math.max(
                SIDEBAR_MIN_WIDTH,
                $sidebarWidth - SIDEBAR_KEYBOARD_RESIZE_STEP,
            );
            $sidebarWidth = newWidth;
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            const newWidth = Math.min(
                SIDEBAR_MAX_WIDTH,
                $sidebarWidth + SIDEBAR_KEYBOARD_RESIZE_STEP,
            );
            $sidebarWidth = newWidth;
        }
    }
</script>

<!--
    ROOT WRAPPER:
    The data attributes here trigger the CSS rules in atmosphere.base.css
    and the specific packs (fantasy.css, scifi.css).
-->
<div
    class="app-shell"
    style="--sidebar-width: {$sidebarWidth}px; --texture-opacity: {$atmosphere.textureOpacity};"
    data-icons={$atmosphere.icons}
    data-buttons={$atmosphere.buttons}
    data-texture={$atmosphere.textures}
    data-typography={$atmosphere.typography}
    data-cursor={$atmosphere.cursors}
    data-borders={$atmosphere.borders}
    data-frames={$atmosphere.frames}
    data-ui={$atmosphere.uiElements}
    data-mode={$atmosphereMode}
>
    <AtmosphereEffects />
    <ModalManager />

    {#if $appStatus.state === "selecting_vault"}
        <VaultSelector onVaultSelected={handleVaultSelected} />
    {:else if $appStatus.state === "loading"}
        <div class="loading-screen">
            <img
                src="/logo.png"
                alt="Chronicler Logo"
                class="welcome-icon animate-spin"
            />
            <h1 class="welcome-title">Opening Vault...</h1>
        </div>
    {:else if $appStatus.state === "error"}
        <div class="loading-screen">
            <h1 class="welcome-title">Error</h1>
            <ErrorBox>{$appStatus.message}</ErrorBox>
            <Button onclick={handleTryAgain}>Select a Different Folder</Button>
        </div>
    {:else if $appStatus.state === "ready"}
        <Sidebar bind:width={$sidebarWidth} />

        <div
            class="resizer"
            onmousedown={startResize}
            onkeydown={handleKeyResize}
            role="slider"
            tabindex="0"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            aria-valuenow={$sidebarWidth}
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            style="left: {$sidebarWidth - 2.5}px;"
        ></div>

        <!-- Main content area -->
        <main class="main-content">
            {@render children()}
        </main>
    {/if}
</div>

<style>
    /* The app-shell handles the global layout.
       It uses flexbox to lay out the sidebar and main content side-by-side.
    */
    .app-shell {
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        position: relative;
        display: flex; /* Flex layout for sidebar + content */
        color: var(--color-text-primary);
        font-family: var(--font-family-body);
        background-color: var(--color-background-primary);
    }

    .loading-screen {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        z-index: 50; /* Sit above everything else */
    }

    .main-content {
        display: flex;
        flex-grow: 1;
        height: 100%;
        margin-left: var(--sidebar-width);
        position: relative;
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
