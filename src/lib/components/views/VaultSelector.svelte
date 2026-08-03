<script lang="ts">
    import { onMount } from "svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Icon from "$lib/components/ui/Icon.svelte";
    import { open } from "@tauri-apps/plugin-dialog";
    import { getVersion } from "@tauri-apps/api/app";
    import { getRecentVaults, removeRecentVault } from "$lib/commands";
    import { log } from "$lib/logger";
    import { vaultDisplayName } from "$lib/utils";
    import { t } from "$lib/i18n";

    let { onVaultSelected = (_path: string) => {} } = $props<{
        onVaultSelected?: (path: string) => void;
    }>();

    let recentVaults = $state<string[]>([]);
    let appVersion = $state("");

    async function refreshRecentVaults() {
        try {
            recentVaults = await getRecentVaults();
        } catch (e) {
            log.error("Failed to load recent vaults", e, "VaultSelector");
        }
    }

    onMount(() => {
        refreshRecentVaults();
        getVersion()
            .then((v) => (appVersion = v))
            .catch((e) =>
                log.error("Failed to get app version", e, "VaultSelector"),
            );
    });

    /**
     * Opens the folder picker. There is only one way in: the OS dialog can
     * create a folder as well as pick one, so a separate "new vault" entry
     * point would have opened the identical dialog under a different name.
     */
    async function selectVault() {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: $t("vaultSelector.dialogTitle"),
            });
            if (typeof selected === "string") {
                onVaultSelected(selected);
            }
        } catch (e) {
            log.error("Error opening folder dialog", e, "VaultSelector");
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
            log.error("Failed to remove recent vault", err, "VaultSelector");
        }
    }
</script>

<!--
  Two columns rather than one tall stack. The old layout put a 150px logo, a
  5rem title and a tagline above a scrolling list, which is why it needed four
  max-height media queries to survive a laptop screen at 150% scaling: identity
  and action were fighting for the same vertical space. Side by side, each gets
  its own axis and the height problem disappears.
-->
<div class="selector-container">
    <div class="hero-banner">
        <img src="/banner.png" alt="" />
        <div class="hero-overlay"></div>
    </div>

    <div class="selector-content">
        <section class="brand-column">
            <img src="/logo.png" alt="" class="brand-logo" />
            <h1 class="brand-title">Chronicler</h1>
            <div class="ornament-rule"><span aria-hidden="true">◆</span></div>
            <p class="brand-tagline">{$t("vaultSelector.tagline")}</p>
            <p class="brand-promises eyebrow">
                {$t("vaultSelector.promises")}
            </p>
        </section>

        <section class="vault-card">
            {#if recentVaults.length > 0}
                <header class="card-heading">
                    <span class="eyebrow">{$t("vaultSelector.openRecent")}</span
                    >
                    <span class="count">{recentVaults.length}</span>
                </header>

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
                                        >{vaultDisplayName(path)}</span
                                    >
                                    <span class="vault-path" title={path}
                                        >{path}</span
                                    >
                                </div>
                                <button
                                    class="remove-btn"
                                    onclick={(e) => handleRemoveRecent(e, path)}
                                    title={$t(
                                        "vaultSelector.removeFromHistory",
                                    )}
                                >
                                    <Icon type="close" />
                                </button>
                            </div>
                        {/each}
                    </div>
                </div>

                <div class="divider"><span>{$t("vaultSelector.or")}</span></div>
            {/if}

            <div class="card-actions">
                <Button variant="accent" size="large" onclick={selectVault}>
                    {$t("vaultSelector.openFolder")}
                </Button>
            </div>

            <p class="card-footnote">
                {$t("vaultSelector.obsidianNote")}
                {#if appVersion}· v{appVersion}{/if}
            </p>
        </section>
    </div>
</div>

<style>
    .selector-container {
        display: flex;
        align-items: center;
        justify-content: center;
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
        inset: 0;
        z-index: 0;
    }

    .hero-banner img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.4;
        object-position: center right;
    }

    /* The horizontal gradient now fades left→right instead of hugging both
       edges: the brand column lives on the left and needs a solid backdrop,
       while the artwork stays visible behind the card on the right. */
    .hero-overlay {
        position: absolute;
        inset: 0;
        background:
            linear-gradient(
                to bottom,
                transparent 0%,
                var(--color-background-primary) 100%
            ),
            linear-gradient(
                to right,
                var(--color-background-primary) 0%,
                var(--color-background-primary) 22%,
                transparent 75%
            );
    }

    /* --- Content Wrapper --- */
    .selector-content {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4rem;
        width: 100%;
        max-width: 1100px;
        padding: 2rem;
        box-sizing: border-box;
        /* Wrap to a stack before anything overflows, so a narrow or heavily
           scaled window degrades instead of clipping. */
        flex-wrap: wrap;
    }

    /* --- Left: identity --- */
    .brand-column {
        flex: 1 1 320px;
        min-width: 0;
        max-width: 440px;
    }

    .brand-logo {
        width: 84px;
        height: 84px;
        object-fit: contain;
    }

    .brand-title {
        font-family: var(--font-family-heading);
        font-size: 3.6rem;
        margin: 1rem 0 0;
        color: var(--color-text-heading);
        line-height: 1.05;
    }

    .brand-tagline {
        font-size: 1.35rem;
        color: var(--color-text-primary);
        margin: 0;
        opacity: 0.9;
        line-height: 1.5;
    }

    /* This screen is the app's first impression on a full window, not a
       cramped sidebar — the shared chrome sizes (--label-size at 0.6rem, and
       the 0.7–0.85rem support text below) read as fine print here. Everything
       on it steps up a notch. */
    .brand-promises {
        margin: 1.6rem 0 0;
        font-size: 0.74rem;
        /* Wider tracking than the shared .eyebrow: this is a standalone strip,
           not a heading over something. */
        letter-spacing: 0.2em;
        line-height: 1.8;
    }

    /* --- Right: the actual choice --- */
    .vault-card {
        flex: 0 1 456px;
        min-width: 0;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-height: 74vh;
        background-color: var(--color-background-primary);
        border: 1px solid var(--color-border-primary);
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 4px 20px var(--color-overlay-subtle);
    }

    .card-heading {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.5rem;
        padding-bottom: 0.6rem;
        border-bottom: 1px solid var(--color-border-primary);
        flex-shrink: 0;
    }

    .card-heading .eyebrow {
        font-size: 0.74rem;
    }

    .count {
        font-size: 0.85rem;
        color: var(--color-text-secondary);
        opacity: 0.7;
    }

    /* --- Recent List Scroll Management --- */
    .recent-list-scroll-area {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
        padding-right: 0.5rem;
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
        padding: 0.6rem 0.8rem;
        background-color: var(--color-background-secondary);
        border: 1px solid transparent;
        border-radius: 8px;
        cursor: pointer;
        gap: 0.8rem;
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
        font-size: 1.4rem;
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
        font-family: var(--font-family-heading);
        font-size: 1.08rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .vault-path {
        font-size: 0.86rem;
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
        padding: 0.4rem;
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
    .divider {
        display: flex;
        align-items: center;
        color: var(--color-text-secondary);
        font-size: 0.78rem;
        letter-spacing: var(--label-tracking);
        flex-shrink: 0;
    }

    .divider::before,
    .divider::after {
        content: "";
        flex: 1;
        border-bottom: 1px solid var(--color-border-primary);
    }

    .divider span {
        padding: 0 0.8rem;
        text-transform: uppercase;
    }

    .card-actions {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        flex-shrink: 0;
    }

    /* The accent button is the one call to action on this screen; everything
       else on the card defers to it. */
    .card-actions :global(.btn.accent) {
        width: 100%;
        justify-content: center;
    }

    .card-footnote {
        margin: 0;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border-primary);
        font-size: 0.84rem;
        color: var(--color-text-secondary);
        text-align: center;
        flex-shrink: 0;
    }
</style>
