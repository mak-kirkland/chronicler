<script lang="ts">
    import { onMount } from "svelte";
    import Button from "./Button.svelte";
    import ThemedIcon from "./ThemedIcon.svelte";
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
            <h1 class="brand-title">Chronicler</h1>
            <p class="brand-tagline">
                Your digital scriptorium — where knowledge links together.
            </p>
        </div>

        <div class="vault-switcher">
            {#if recentVaults.length > 0}
                <div class="recent-list-section">
                    <h3>Open Recent</h3>
                    <div class="recent-list">
                        {#each recentVaults as path (path)}
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div
                                class="recent-item"
                                onclick={() => handleRecentClick(path)}
                            >
                                <div class="vault-icon">
                                    <ThemedIcon type="folder" />
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
                                    onclick={(e) => handleRemoveRecent(e, path)}
                                    title="Remove from history"
                                >
                                    <ThemedIcon type="close" />
                                </button>
                            </div>
                        {/each}
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
        justify-content: center;
        width: 100%;
        height: 100vh; /* Fixed height to viewport */
        overflow: hidden; /* Disable scrolling on main container */
        padding: 2rem;
        box-sizing: border-box;
    }

    /* --- Branding --- */
    .brand-header {
        text-align: center;
        margin-bottom: 2rem;
        flex-shrink: 0; /* Prevent branding from shrinking */
    }

    .brand-logo {
        width: 150px; /* Match WelcomeView size */
        height: 150px;
        margin-bottom: 2rem;
    }

    .brand-title {
        font-family: var(--font-family-heading);
        font-size: 5rem; /* Match WelcomeView size */
        margin: 0 0 1rem 0;
        color: var(--color-text-heading);
        text-shadow: 0 4px 12px var(--color-background-primary);
    }

    .brand-tagline {
        font-size: 1.6rem; /* Match WelcomeView size */
        color: var(--color-text-primary);
        text-shadow: 0 2px 6px var(--color-background-primary);
        margin: 0;
        opacity: 0.9;
    }

    /* --- Vault Switcher Area --- */
    .vault-switcher {
        width: 100%;
        max-width: 550px;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        flex-shrink: 1; /* Allow container to shrink if needed */
        min-height: 0; /* Enable flex scrolling */
        overflow: hidden; /* Keep children inside */
    }

    .recent-list-section {
        background-color: var(--color-background-primary);
        border: 1px solid var(--color-border-primary);
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 4px 20px var(--color-overlay-subtle);

        /* Flexbox for inner scrolling */
        display: flex;
        flex-direction: column;
        flex-shrink: 1; /* This section is allowed to shrink */
        min-height: 0; /* Enable scrolling for child */
        scrollbar-gutter: stable;
    }

    .open-action-card {
        background-color: var(--color-background-primary);
        border: 1px solid var(--color-border-primary);
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 4px 20px var(--color-overlay-subtle);
        flex-shrink: 0; /* Do not shrink the open button card */
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

    /* --- Recent List --- */
    .recent-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        overflow-y: auto;
        padding-right: 0.5rem;

        transform: translateZ(0);
        position: relative;
        z-index: 0;
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
        flex-shrink: 0; /* Items shouldn't squash */

        transition:
            background-color 0.2s ease,
            border-color 0.2s ease,
            box-shadow 0.2s ease;

        /* Optimization: hints to browser that this element changes */
        will-change: transform, box-shadow;
    }

    .recent-item:hover {
        /* Removed translateY to prevent clipping/underlap issues */
        border-color: var(--color-accent-primary);
        box-shadow: 0 4px 12px var(--color-overlay-subtle);
        background-color: var(--color-background-tertiary);
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
        direction: rtl; /* Truncate form the start for paths */
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

    .recent-item:hover .remove-btn {
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
        gap: 1.5rem;
        width: 100%;
        flex-shrink: 0; /* Don't shrink actions */
    }

    .divider {
        width: 100%;
        display: flex;
        align-items: center;
        color: var(
            --color-text-primary
        ); /* Use primary text color for visibility */
        font-size: 1.1rem; /* Increase size */
        font-weight: bold;
        text-shadow: 0 1px 2px var(--color-background-primary);
    }

    .divider::before,
    .divider::after {
        content: "";
        flex: 1;
        border-bottom: 2px solid var(--color-border-primary); /* Make line thicker */
    }

    .divider span {
        padding: 0 1rem;
        text-transform: uppercase;
        opacity: 1; /* Fully opaque */
    }

    .open-action-card {
        text-align: center;
        width: 100%;
        /* Inherit container styles from .recent-list-section but ensure box-sizing */
        box-sizing: border-box;
    }
</style>
