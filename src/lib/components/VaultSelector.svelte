<script lang="ts">
    import { onMount } from "svelte";
    import Button from "./Button.svelte";
    import Icon from "./Icon.svelte";
    import { open } from "@tauri-apps/plugin-dialog";
    import { getRecentVaults, removeRecentVault } from "$lib/commands";

    let { onVaultSelected = (_path: string) => {} } = $props<{
        onVaultSelected?: (path: string) => void;
    }>();

    let recentVaults = $state<string[]>([]);

    async function refreshRecentVaults() {
        try {
            recentVaults = await getRecentVaults();
        } catch (e) {
            console.error("Failed to load recent vaults:", e);
        }
    }

    onMount(() => {
        refreshRecentVaults();
    });

    async function selectVault() {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: "Select Your Vault Folder",
            });
            if (typeof selected === "string") {
                onVaultSelected(selected);
            }
        } catch (e) {
            console.error("Error opening folder dialog:", e);
        }
    }

    function handleRecentClick(path: string) {
        onVaultSelected(path);
    }

    // Handle keyboard interaction for accessibility
    function handleKeydown(e: KeyboardEvent, path: string) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRecentClick(path);
        }
    }

    async function handleRemoveRecent(e: MouseEvent, path: string) {
        e.stopPropagation();
        try {
            await removeRecentVault(path);
            await refreshRecentVaults();
        } catch (err) {
            console.error("Failed to remove recent vault:", err);
        }
    }

    // Helper to extract the folder name from the full path
    function getVaultName(path: string): string {
        // Handle both Windows (\) and Unix (/) separators
        const parts = path.split(/[\\/]/);
        return parts.pop() || path;
    }
</script>

<div class="selector-container">
    <div class="hero-banner">
        <img src="/banner.png" alt="Chronicler Banner" />
        <div class="hero-overlay"></div>
    </div>

    <div class="selector-content">
        <div class="brand-header">
            <img src="/logo.png" alt="Chronicler Logo" class="brand-logo" />
            <div class="brand-text-wrapper">
                <h1 class="brand-title">Chronicler</h1>
                <p class="brand-tagline">
                    Your digital scriptorium — where knowledge links together.
                </p>
            </div>
        </div>

        <div class="vault-switcher">
            {#if recentVaults.length > 0}
                <div class="recent-list-section">
                    <h3>Open Recent</h3>
                    <div class="recent-list-scroll-area">
                        <div class="recent-list">
                            {#each recentVaults as path (path)}
                                <div
                                    class="recent-item"
                                    role="button"
                                    tabindex="0"
                                    onclick={() => handleRecentClick(path)}
                                    onkeydown={(e) => handleKeydown(e, path)}
                                >
                                    <div class="vault-icon">
                                        <Icon type="folder" />
                                    </div>
                                    <div class="vault-info">
                                        <span class="vault-name"
                                            >{getVaultName(path)}</span
                                        >
                                        <span class="vault-path" title={path}
                                            >{path}</span
                                        >
                                    </div>
                                    <button
                                        class="remove-btn"
                                        onclick={(e) =>
                                            handleRemoveRecent(e, path)}
                                        title="Remove from history"
                                    >
                                        <Icon type="close" />
                                    </button>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            {/if}

            <div class="action-section">
                {#if recentVaults.length > 0}
                    <div class="divider">
                        <span>or</span>
                    </div>
                {/if}

                <div class="open-action-card">
                    <Button size="large" onclick={selectVault}
                        >Open Folder...</Button
                    >
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    .selector-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center; /* Center content vertically */
        height: 100vh;
        width: 100vw;
        color: var(--color-text-primary);
        background-color: var(--color-background-primary);
        overflow: hidden; /* Prevent scrollbars from banner */
        position: relative;
    }

    /* --- Banner Background --- */
    .hero-banner {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 0;
    }

    .hero-banner img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.4;
        object-position: center right;
    }

    .hero-overlay {
        position: absolute;
        inset: 0;
        /* Gradient logic similar to WelcomeView for consistency */
        background:
            linear-gradient(
                to bottom,
                transparent 0%,
                var(--color-background-primary) 100%
            ),
            linear-gradient(
                to right,
                var(--color-background-primary) 0%,
                transparent 50%,
                var(--color-background-primary) 100%
            );
    }

    /* --- Content Wrapper --- */
    .selector-content {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        /* Change from center to flex-start to prevent overlap */
        justify-content: flex-start;
        padding-top: 5vh; /* Dynamic top padding */
        width: 100%;
        height: 100vh;
        overflow: hidden;
        padding: 2rem;
        box-sizing: border-box;
        gap: 2rem; /* Consistent spacing between brand and list */
    }

    /* --- Branding --- */
    .brand-header {
        text-align: center;
        /* Allow shrinking! */
        flex-shrink: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        min-height: 0; /* Important for flex shrinking */
    }

    .brand-logo {
        width: 150px;
        height: 150px;
        margin-bottom: 2rem;
        object-fit: contain;
        transition: all 0.3s ease;
    }

    .brand-title {
        font-family: var(--font-family-heading);
        font-size: 5rem;
        margin: 0 0 1rem 0;
        color: var(--color-text-heading);
        text-shadow: 0 4px 12px var(--color-background-primary);
        line-height: 1.1;
        transition: font-size 0.3s ease;
    }

    .brand-tagline {
        font-size: 1.6rem;
        color: var(--color-text-primary);
        text-shadow: 0 2px 6px var(--color-background-primary);
        margin: 0;
        opacity: 0.9;
        transition:
            opacity 0.2s ease,
            height 0.3s ease;
    }

    /* --- Responsive Branding Logic (The Fix for 150% Scale) --- */

    /* Moderate height restriction (e.g. standard laptops or mild scaling) */
    @media (max-height: 850px) {
        .selector-content {
            padding-top: 1rem;
            gap: 1rem;
        }
        .brand-logo {
            width: 100px;
            height: 100px;
            margin-bottom: 1rem;
        }
        .brand-title {
            font-size: 3.5rem;
            margin-bottom: 0.5rem;
        }
        .brand-tagline {
            font-size: 1.2rem;
        }
    }

    /* Strict height restriction (High scaling or small windows) */
    @media (max-height: 650px) {
        .brand-logo {
            width: 60px;
            height: 60px;
            margin-bottom: 0.5rem;
        }
        .brand-title {
            font-size: 2.5rem;
            margin-bottom: 0;
        }
        .brand-tagline {
            display: none;
        } /* Hide tagline completely */
    }

    /* Extreme height restriction (Landscape tablets or very high scaling) */
    @media (max-height: 500px) {
        .brand-header {
            display: none;
        } /* Hide entire header to show UI */
        .selector-content {
            justify-content: center;
            padding-top: 0;
        }
    }

    /* --- Vault Switcher Area --- */
    .vault-switcher {
        width: 100%;
        max-width: 550px;
        display: flex;
        flex-direction: column;
        gap: 1rem;

        /* This is crucial: take remaining space */
        flex: 1;
        min-height: 0;
    }

    .recent-list-section {
        background-color: var(--color-background-primary);
        border: 1px solid var(--color-border-primary);
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 4px 20px var(--color-overlay-subtle);

        /* Make this section fill the flexible space */
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0; /* Allows the child to scroll */
    }

    h3 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--color-border-primary);
        flex-shrink: 0;
    }

    /* --- Recent List Scroll Management --- */
    .recent-list-scroll-area {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
        padding-right: 0.5rem;
        /* Scrollbar styling for Webkit */
        scrollbar-width: thin;
        scrollbar-color: var(--color-border-primary) transparent;
    }

    .recent-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .recent-item {
        display: flex;
        align-items: center;
        padding: 0.75rem 1rem;
        background-color: var(--color-background-secondary);
        border: 1px solid transparent;
        border-radius: 8px;
        cursor: pointer;
        gap: 1rem;
        flex-shrink: 0;
        transition:
            background-color 0.2s ease,
            border-color 0.2s ease;
    }

    .recent-item:hover {
        border-color: var(--color-accent-primary);
        background-color: var(--color-background-tertiary);
    }

    .recent-item:focus-visible {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 2px;
    }

    .vault-icon {
        font-size: 1.5rem;
        color: var(--color-text-secondary);
        display: flex;
        align-items: center;
    }

    .recent-item:hover .vault-icon {
        color: var(--color-accent-primary);
    }

    .vault-info {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .vault-name {
        font-weight: bold;
        font-size: 1.1rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .vault-path {
        font-size: 0.85rem;
        color: var(--color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        direction: rtl;
        text-align: left;
    }

    .remove-btn {
        background: none;
        border: none;
        color: var(--color-text-secondary);
        opacity: 0;
        cursor: pointer;
        padding: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s;
    }

    .recent-item:hover .remove-btn,
    .recent-item:focus-visible .remove-btn {
        opacity: 0.6;
    }

    .remove-btn:hover {
        opacity: 1 !important;
        background-color: var(--color-background-primary);
        color: var(--color-text-error);
    }

    /* --- Action Area --- */
    .action-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        width: 100%;
        flex-shrink: 0; /* Keep this always visible */
        padding-top: 0.5rem;
    }

    .divider {
        width: 100%;
        display: flex;
        align-items: center;
        color: var(--color-text-primary);
        font-size: 1.1rem;
        font-weight: bold;
        text-shadow: 0 1px 2px var(--color-background-primary);
    }

    .divider::before,
    .divider::after {
        content: "";
        flex: 1;
        border-bottom: 2px solid var(--color-border-primary);
    }

    .divider span {
        padding: 0 1rem;
        text-transform: uppercase;
    }

    .open-action-card {
        text-align: center;
        width: 100%;
        box-sizing: border-box;
        background-color: var(--color-background-primary);
        border: 1px solid var(--color-border-primary);
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 4px 20px var(--color-overlay-subtle);
    }
</style>
