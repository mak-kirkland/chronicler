<script lang="ts">
    import { iconPacks } from "$lib/icons";
    import { activeIconPack } from "$lib/settingsStore";
    import { licenseStore } from "$lib/licenseStore";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { DONATE_URL } from "$lib/config";
    import Modal from "./Modal.svelte";
    import Button from "./Button.svelte";

    let { onClose } = $props<{ onClose: () => void }>();

    const packs = Object.values(iconPacks);

    function handleSelect(packId: string) {
        $activeIconPack = packId;
    }

    function handlePurchase() {
        openUrl(DONATE_URL);
    }
</script>

<Modal title="World Packs & Icons" {onClose}>
    <p class="description">
        Choose an icon set that matches the atmosphere of your world.
    </p>

    <div class="pack-grid">
        {#each packs as pack (pack.id)}
            {@const isOwned =
                pack.id === "core" ||
                $licenseStore.license?.entitlements.includes(pack.id)}
            {@const isActive = $activeIconPack === pack.id}

            <div
                class="pack-card"
                class:active={isActive}
                class:locked={!isOwned}
                onclick={() => isOwned && handleSelect(pack.id)}
                role="button"
                tabindex="0"
                onkeydown={(e) =>
                    e.key === "Enter" && isOwned && handleSelect(pack.id)}
            >
                <div class="pack-header">
                    <h3>{pack.name}</h3>
                    {#if !isOwned}
                        <span class="lock-icon" title="Supporter Pack">🔒</span>
                    {/if}
                </div>
                <p class="pack-desc">{pack.description}</p>

                <div class="preview-row">
                    <!-- Manually construct SVG previews using the pack data since Icon is tied to active store -->
                    <div class="preview-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            {@html pack.icons.folder}
                        </svg>
                        <span>Folder</span>
                    </div>
                    <div class="preview-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            {@html pack.icons.file}
                        </svg>
                        <span>File</span>
                    </div>
                </div>

                <div class="pack-status">
                    {#if isActive}
                        <span class="badge active">Active</span>
                    {:else if isOwned}
                        <span class="badge owned">Owned</span>
                    {:else}
                        <Button size="small" onclick={handlePurchase}
                            >Unlock</Button
                        >
                    {/if}
                </div>
            </div>
        {/each}
    </div>
</Modal>

<style>
    .description {
        color: var(--color-text-secondary);
        margin-bottom: 1.5rem;
    }
    .pack-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 1rem;
    }
    .pack-card {
        border: 2px solid var(--color-border-primary);
        border-radius: 8px;
        padding: 1rem;
        background-color: var(--color-background-secondary);
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        position: relative;
    }
    .pack-card:hover {
        border-color: var(--color-accent-primary);
        transform: translateY(-2px);
    }
    .pack-card.active {
        border-color: var(--color-accent-primary);
        background-color: var(--color-background-tertiary);
        box-shadow: 0 0 0 1px var(--color-accent-primary);
    }
    .pack-card.locked {
        opacity: 0.8;
        cursor: default;
    }
    .pack-card.locked:hover {
        transform: none;
        border-color: var(--color-border-primary);
    }
    .pack-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .pack-header h3 {
        margin: 0;
        font-size: 1.1rem;
    }
    .pack-desc {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        margin: 0;
        flex-grow: 1;
    }
    .preview-row {
        display: flex;
        gap: 1.5rem;
        margin: 1rem 0;
        padding: 0.5rem;
        background-color: var(--color-background-primary);
        border-radius: 4px;
        justify-content: center;
    }
    .preview-icon {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.8rem;
        color: var(--color-text-secondary);
    }
    .preview-icon svg {
        width: 24px;
        height: 24px;
        color: var(--color-text-primary);
    }
    .badge {
        font-size: 0.8rem;
        font-weight: bold;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        text-transform: uppercase;
    }
    .badge.active {
        background-color: var(--color-accent-primary);
        color: var(--color-text-primary);
    }
    .badge.owned {
        background-color: var(--color-overlay-medium);
        color: var(--color-text-secondary);
    }
    .pack-status {
        display: flex;
        justify-content: flex-end;
    }
</style>
