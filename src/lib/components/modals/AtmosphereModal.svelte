<script lang="ts">
    import { atmosphere, type AtmosphereSettings } from "$lib/settingsStore";
    import { licenseStore } from "$lib/licenseStore";
    import { atmospheres } from "$lib/atmospheres";
    import { iconPacks } from "$lib/icons";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { DONATE_URL } from "$lib/config";
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Select from "$lib/components/ui/Select.svelte";

    let { onClose } = $props<{ onClose: () => void }>();

    // Define the available atmosphere packs
    const packs = Object.values(atmospheres);

    // Define available icon packs (includes free options like "legacy")
    const availableIconPacks = Object.entries(iconPacks).map(([id, pack]) => ({
        id,
        name:
            id === "core"
                ? "Standard"
                : id === "legacy"
                  ? "Legacy (Emoji)"
                  : id === "fantasy-pack"
                    ? "High Fantasy"
                    : id,
        pack,
    }));

    // Define a strict module key type that EXCLUDES 'textureOpacity' (which is a number)
    type AtmosphereStringKey = Exclude<
        keyof AtmosphereSettings,
        "textureOpacity"
    >;

    // Define the modules we can configure for the fine-tuning section
    // Icons is handled separately since it has more options
    const modules: { key: AtmosphereStringKey; label: string }[] = [
        { key: "buttons", label: "Buttons" },
        { key: "textures", label: "Textures" },
        { key: "typography", label: "Typography" },
        { key: "borders", label: "Borders" },
        { key: "frames", label: "Image Frames" },
        { key: "uiElements", label: "UI Elements" },
        // { key: "cursors", label: "Cursors" },
        // { key: "clickEffects", label: "Click & Type Effects" },
        // { key: "soundscape", label: "Ambience" }, // Uncomment when implemented
    ];

    function isOwned(packId: string): boolean {
        return (
            packId === "core" ||
            ($licenseStore.license?.entitlements || []).includes(packId)
        );
    }

    // Check if an icon pack is available (free packs like "legacy" are always available)
    function isIconPackAvailable(packId: string): boolean {
        // "core" and "legacy" are always free
        if (packId === "core" || packId === "legacy") {
            return true;
        }
        // Other packs require ownership
        return ($licenseStore.license?.entitlements || []).includes(packId);
    }

    // Checks if a specific pack is currently fully active across all modules
    function isPackActive(packId: string): boolean {
        // Check icons separately since it can have different values
        const iconsMatch = $atmosphere.icons === packId;
        const modulesMatch = modules.every(
            (mod) => $atmosphere[mod.key] === packId,
        );
        return iconsMatch && modulesMatch;
    }

    // Quick Apply: Sets ALL modules to a specific pack
    function applyPreset(packId: string) {
        if (!isOwned(packId)) return;

        atmosphere.update((current) => {
            const newSettings = { ...current };
            newSettings.icons = packId;
            for (const mod of modules) {
                newSettings[mod.key] = packId;
            }
            return newSettings;
        });
    }

    // Update icons specifically
    function updateIcons(packId: string) {
        atmosphere.update((current) => ({
            ...current,
            icons: packId,
        }));
    }

    // Granular Update: Sets a single module
    function updateModule(key: AtmosphereStringKey, packId: string) {
        atmosphere.update((current) => ({
            ...current,
            [key]: packId,
        }));
    }

    function updateOpacity(e: Event) {
        const val = parseFloat((e.currentTarget as HTMLInputElement).value);
        atmosphere.update((s) => ({ ...s, textureOpacity: val }));
    }

    function handlePurchase() {
        openUrl(DONATE_URL);
    }
</script>

<Modal title="Atmosphere & Immersion" {onClose}>
    <div class="modal-content-wrapper">
        <section class="pack-section">
            <div class="section-header">
                <h4>Atmosphere Packs</h4>
                <p>
                    Total conversion skins that change icons, textures, and UI
                    elements to match a genre.
                </p>
            </div>

            <div class="pack-grid">
                {#each packs as pack (pack.id)}
                    {@const owned = isOwned(pack.id)}
                    {@const active = isPackActive(pack.id)}

                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="pack-card"
                        class:active
                        class:locked={!owned}
                        onclick={() => owned && applyPreset(pack.id)}
                    >
                        <div class="pack-card-header">
                            <span class="pack-name">{pack.name}</span>
                            {#if active}
                                <span class="badge active-badge">Active</span>
                            {:else if owned}
                                <span class="badge owned-badge">Owned</span>
                            {:else}
                                <span class="lock-icon">🔒</span>
                            {/if}
                        </div>

                        <div class="pack-preview">
                            {#if pack.iconSet.type === "svg"}
                                <svg viewBox="0 0 24 24" class="preview-icon">
                                    {@html pack.iconSet.icons.folder}
                                </svg>
                                <svg viewBox="0 0 24 24" class="preview-icon">
                                    {@html pack.iconSet.icons.file}
                                </svg>
                                <svg viewBox="0 0 24 24" class="preview-icon">
                                    {@html pack.iconSet.icons.settings}
                                </svg>
                            {:else if pack.iconSet.type === "img"}
                                <span
                                    class="preview-img-icon"
                                    style="--icon-url: url('{pack.iconSet.icons
                                        .folder}')"
                                ></span>
                                <span
                                    class="preview-img-icon"
                                    style="--icon-url: url('{pack.iconSet.icons
                                        .file}')"
                                ></span>
                                <span
                                    class="preview-img-icon"
                                    style="--icon-url: url('{pack.iconSet.icons
                                        .settings}')"
                                ></span>
                            {:else}
                                <span class="preview-text-icon"
                                    >{pack.iconSet.icons.folder}</span
                                >
                                <span class="preview-text-icon"
                                    >{pack.iconSet.icons.file}</span
                                >
                                <span class="preview-text-icon"
                                    >{pack.iconSet.icons.settings}</span
                                >
                            {/if}
                        </div>

                        <p class="pack-desc">{pack.description}</p>

                        {#if !owned}
                            <div class="unlock-overlay">
                                <Button
                                    variant="primary"
                                    size="small"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        handlePurchase();
                                    }}
                                >
                                    Get Pack
                                </Button>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        </section>

        <section class="global-section">
            <div class="setting-control-row">
                <div class="label-group">
                    <label for="opacity-slider">Texture Opacity</label>
                    <span class="sub-label"
                        >Adjust the intensity of the background texture.</span
                    >
                </div>
                <input
                    type="range"
                    id="opacity-slider"
                    min="0"
                    max="1"
                    step="0.05"
                    value={$atmosphere.textureOpacity}
                    oninput={updateOpacity}
                    class="opacity-range"
                />
            </div>
        </section>

        <hr />

        <!-- Granular Mixer -->
        <section class="mixer-section">
            <div class="section-header">
                <h4>Fine Tuning</h4>
                <p>Mix and match individual elements from your owned packs.</p>
            </div>

            <div class="mixer-grid">
                <!-- Icons dropdown with all icon packs (including free legacy) -->
                <div class="mixer-row">
                    <!-- svelte-ignore a11y_label_has_associated_control -->
                    <label>Icons</label>
                    <div class="select-wrapper">
                        <Select
                            options={availableIconPacks.map((iconPack) => ({
                                value: iconPack.id,
                                label: iconPack.name,
                                disabled: !isIconPackAvailable(iconPack.id),
                            }))}
                            value={$atmosphere.icons}
                            onSelect={(val) => updateIcons(val)}
                        />
                    </div>
                </div>

                <!-- Other modules use atmosphere packs only -->
                {#each modules as mod}
                    <div class="mixer-row">
                        <!-- svelte-ignore a11y_label_has_associated_control -->
                        <label>{mod.label}</label>
                        <div class="select-wrapper">
                            <Select
                                options={packs.map((pack) => ({
                                    value: pack.id,
                                    label: pack.name,
                                    disabled: !isOwned(pack.id),
                                }))}
                                value={$atmosphere[mod.key]}
                                onSelect={(val) => updateModule(mod.key, val)}
                            />
                        </div>
                    </div>
                {/each}
            </div>
        </section>
    </div>
</Modal>

<style>
    .modal-content-wrapper {
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }

    .section-header {
        margin-bottom: 1rem;
    }

    h4 {
        margin: 0 0 0.25rem 0;
        font-size: 1.1rem;
        color: var(--color-text-primary);
    }

    p {
        margin: 0;
        font-size: 0.9rem;
        color: var(--color-text-secondary);
    }

    /* --- Pack Grid Styles --- */
    .pack-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 1rem;
    }

    .pack-card {
        position: relative;
        background-color: var(--color-background-secondary);
        border: 2px solid var(--color-border-primary);
        border-radius: 8px;
        padding: 1rem;
        cursor: pointer;
        transition:
            transform 0.2s,
            border-color 0.2s,
            box-shadow 0.2s;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        overflow: hidden;
    }

    .pack-card:hover:not(.locked) {
        transform: translateY(-2px);
        border-color: var(--color-text-secondary);
        box-shadow: 0 4px 12px var(--color-overlay-subtle);
    }

    .pack-card.active {
        border-color: var(--color-accent-primary);
        background-color: var(--color-background-tertiary);
        box-shadow: 0 0 0 1px var(--color-accent-primary);
    }

    .pack-card.locked {
        opacity: 0.9;
        cursor: default;
    }

    .pack-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .pack-name {
        font-weight: bold;
        color: var(--color-text-primary);
    }

    .pack-desc {
        font-size: 0.85rem;
        color: var(--color-text-secondary);
        line-height: 1.4;
    }

    /* --- Preview Icons --- */
    .pack-preview {
        display: flex;
        gap: 1rem;
        padding: 0.75rem;
        background-color: var(--color-background-primary);
        border-radius: 6px;
        justify-content: center;
        opacity: 0.8;
        align-items: center; /* Center align for text icons */
    }

    .preview-icon {
        width: 32px;
        height: 32px;
        fill: currentColor;
        color: var(--color-text-primary);
    }

    .preview-img-icon {
        width: 32px;
        height: 32px;
        display: inline-block;
        -webkit-mask-image: var(--icon-url);
        mask-image: var(--icon-url);
        -webkit-mask-size: contain;
        mask-size: contain;
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
        -webkit-mask-position: center;
        mask-position: center;
        background-color: var(--color-accent-primary);
    }

    .preview-text-icon {
        font-size: 1.5rem;
        line-height: 1;
        color: var(--color-text-primary);
    }

    /* --- Badges --- */
    .badge {
        font-size: 0.7rem;
        font-weight: bold;
        text-transform: uppercase;
        padding: 0.15rem 0.5rem;
        border-radius: 4px;
    }

    .active-badge {
        background-color: var(--color-accent-primary);
        color: var(--color-text-primary);
    }

    .owned-badge {
        background-color: var(--color-overlay-medium);
        color: var(--color-text-secondary);
    }

    /* --- Locked Overlay --- */
    .unlock-overlay {
        position: absolute;
        inset: 0;
        background-color: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(2px);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.2s;
    }

    /* Show overlay on hover, or always if it's the only way to interact */
    .pack-card.locked:hover .unlock-overlay {
        opacity: 1;
    }

    /* --- Mixer Styles --- */
    .mixer-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem 2rem;
    }

    .mixer-row {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .mixer-row label {
        font-size: 0.85rem;
        font-weight: bold;
        color: var(--color-text-secondary);
    }

    @media (max-width: 600px) {
        .mixer-grid {
            grid-template-columns: 1fr;
        }
    }

    /* NEW: Global Toggle Styles */
    .setting-control-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: var(--color-background-secondary);
        padding: 1rem;
        border-radius: 8px;
        border: 1px solid var(--color-border-primary);
    }
    .label-group {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .label-group label {
        font-weight: bold;
        color: var(--color-text-primary);
    }
    .sub-label {
        font-size: 0.85rem;
        color: var(--color-text-secondary);
    }

    .opacity-range {
        width: 120px;
        cursor: pointer;
        accent-color: var(--color-accent-primary);
    }
</style>
