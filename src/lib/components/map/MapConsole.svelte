<script lang="ts">
    import { updateMapConfig } from "$lib/mapStore";
    import type {
        MapConfig,
        MapLayer,
        MapPin,
        MapRegion,
    } from "$lib/mapModels";
    import {
        DEFAULT_SHAPE_COLOR,
        DEFAULT_PIN_ICON,
        GHOST_ICON,
        REGION_ICON_CIRCLE,
        REGION_ICON_POLYGON,
    } from "$lib/mapUtils";
    import { openModal, closeModal } from "$lib/modalStore";
    import MapObjectModal from "$lib/components/map/MapObjectModal.svelte";
    import MapSettingsModal from "$lib/components/map/MapSettingsModal.svelte";
    import ConfirmModal from "$lib/components/modals/ConfirmModal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import Icon from "$lib/components/ui/Icon.svelte";
    import SearchInput from "$lib/components/ui/SearchInput.svelte";

    let {
        mapConfig,
        mapPath,
        onClose,
        onHoverPin,
        onHoverRegion,
        activePinId = null,
        activeRegionIds = new Set(),
    } = $props<{
        mapConfig: MapConfig;
        mapPath: string;
        onClose: () => void;
        onHoverPin?: (pinId: string | null) => void;
        onHoverRegion?: (regionId: string | null) => void;
        activePinId?: string | null;
        activeRegionIds?: Set<string>;
    }>();

    let searchTerm = $state("");

    // Helper: Determine if an item should be visible in the console
    // Returns true if:
    // 1. The item has no layer assigned (global)
    // 2. OR the item's assigned layer exists AND is visible
    function isItemVisible(layerId?: string): boolean {
        if (!layerId) return true;
        const layer = mapConfig.layers?.find((l: MapLayer) => l.id === layerId);
        return layer ? layer.visible : false;
    }

    // Filter pins based on layer visibility and search term
    let pins = $derived(
        (mapConfig.pins || [])
            .filter((p: MapPin) => isItemVisible(p.layerId))
            .filter((p: MapPin) =>
                (p.label || "")
                    .toLowerCase()
                    .includes(searchTerm.toLowerCase()),
            ),
    );

    // Filter regions based on layer visibility and search term
    let regions = $derived(
        (mapConfig.shapes || [])
            .filter((s: MapRegion) => isItemVisible(s.layerId))
            .filter((s: MapRegion) =>
                (s.label || "")
                    .toLowerCase()
                    .includes(searchTerm.toLowerCase()),
            ),
    );

    function handleEditPin(pin: MapPin) {
        openModal({
            component: MapObjectModal,
            props: {
                onClose: closeModal,
                mapPath: mapPath,
                mapConfig: mapConfig,
                mode: "pin",
                initialData: pin,
            },
        });
    }

    function handleEditRegion(region: MapRegion) {
        openModal({
            component: MapObjectModal,
            props: {
                onClose: closeModal,
                mapPath: mapPath,
                mapConfig: mapConfig,
                mode: "region",
                initialData: region,
            },
        });
    }

    function handleDeletePin(pinId: string) {
        openModal({
            component: ConfirmModal,
            props: {
                title: "Delete Pin",
                message: "Are you sure you want to delete this pin?",
                onClose: closeModal,
                onConfirm: async () => {
                    try {
                        await updateMapConfig(mapPath, (currentConfig) => ({
                            ...currentConfig,
                            pins: (currentConfig.pins || []).filter(
                                (p) => p.id !== pinId,
                            ),
                        }));
                        closeModal();
                    } catch (e) {
                        alert("Failed to delete pin.");
                    }
                },
            },
        });
    }

    function handleDeleteRegion(regionId: string) {
        openModal({
            component: ConfirmModal,
            props: {
                title: "Delete Region",
                message: "Are you sure you want to delete this region?",
                onClose: closeModal,
                onConfirm: async () => {
                    try {
                        await updateMapConfig(mapPath, (currentConfig) => ({
                            ...currentConfig,
                            shapes: (currentConfig.shapes || []).filter(
                                (s) => s.id !== regionId,
                            ),
                        }));
                        closeModal();
                    } catch (e) {
                        alert("Failed to delete region.");
                    }
                },
            },
        });
    }

    function openSettings() {
        openModal({
            component: MapSettingsModal,
            props: {
                onClose: closeModal,
                mapPath,
                mapConfig,
            },
        });
    }
</script>

<div class="map-console">
    <div class="console-header">
        <h3>Map Console</h3>
        <div class="console-controls">
            <Button
                variant="ghost"
                size="small"
                onclick={openSettings}
                title="Map Settings"
            >
                <Icon type="settings" />
            </Button>
            <Button variant="ghost" size="small" onclick={onClose}>×</Button>
        </div>
    </div>

    <div class="search-container">
        <SearchInput bind:value={searchTerm} placeholder="Search items..." />
    </div>

    <div class="console-content">
        <!-- PINS SECTION -->
        <div class="section">
            <h4>Pins ({pins.length})</h4>
            {#if pins.length === 0}
                <p class="empty-state">
                    {searchTerm ? "No matching pins." : "No visible pins."}
                </p>
            {:else}
                <ul class="item-list">
                    {#each pins as pin}
                        <li
                            class:active={activePinId === pin.id}
                            onmouseenter={() => onHoverPin?.(pin.id)}
                            onmouseleave={() => onHoverPin?.(null)}
                        >
                            <div class="item-info">
                                <span
                                    class="item-icon"
                                    style="color: {pin.color}"
                                >
                                    {#if pin.invisible}
                                        <!-- Ghost indicator for invisible pins -->
                                        <span title="Invisible Pin"
                                            >{GHOST_ICON}</span
                                        >
                                    {:else}
                                        {pin.icon || DEFAULT_PIN_ICON}
                                    {/if}
                                </span>
                                <span class="item-label" title={pin.label}
                                    >{pin.label || "Unnamed Pin"}</span
                                >
                            </div>
                            <div class="item-actions">
                                <button
                                    class="action-btn edit"
                                    onclick={() => handleEditPin(pin)}
                                    title="Edit">✎</button
                                >
                                <button
                                    class="action-btn delete"
                                    onclick={() => handleDeletePin(pin.id)}
                                    title="Delete">🗑️</button
                                >
                            </div>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>

        <!-- REGIONS SECTION -->
        <div class="section">
            <h4>Regions ({regions.length})</h4>
            {#if regions.length === 0}
                <p class="empty-state">
                    {searchTerm
                        ? "No matching regions."
                        : "No visible regions."}
                </p>
            {:else}
                <ul class="item-list">
                    {#each regions as region}
                        <li
                            class:active={activeRegionIds.has(region.id)}
                            onmouseenter={() => onHoverRegion?.(region.id)}
                            onmouseleave={() => onHoverRegion?.(null)}
                        >
                            <div class="item-info">
                                <span
                                    class="item-icon"
                                    style="color: {region.color ||
                                        DEFAULT_SHAPE_COLOR}"
                                >
                                    {#if region.type === "circle"}
                                        {REGION_ICON_CIRCLE}
                                    {:else}
                                        {REGION_ICON_POLYGON}
                                    {/if}
                                </span>
                                <span class="item-label" title={region.label}
                                    >{region.label || "Unnamed Region"}</span
                                >
                            </div>
                            <div class="item-actions">
                                <button
                                    class="action-btn edit"
                                    onclick={() => handleEditRegion(region)}
                                    title="Edit">✎</button
                                >
                                <button
                                    class="action-btn delete"
                                    onclick={() =>
                                        handleDeleteRegion(region.id)}
                                    title="Delete">🗑️</button
                                >
                            </div>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    </div>
</div>

<style>
    .map-console {
        position: absolute;
        top: 0;
        right: 0;
        width: 320px;
        height: 100%;
        background: var(--color-background-secondary);
        border-left: 1px solid var(--color-border-primary);
        z-index: 2000; /* Above map controls */
        display: flex;
        flex-direction: column;
        box-shadow: -4px 0 15px rgba(0, 0, 0, 0.3);
    }

    .console-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 1rem;
        border-bottom: 1px solid var(--color-border-primary);
        background: var(--color-background-primary);
    }

    .console-header h3 {
        margin: 0;
        font-size: 1.1rem;
        color: var(--color-text-heading);
    }

    .console-controls {
        display: flex;
        gap: 0.25rem;
    }

    .search-container {
        padding: 0.25rem;
        background: var(--color-background-secondary);
    }

    .console-content {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem; /* Space between sections */
    }

    .section h4 {
        margin: 0 0 0.5rem 0;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-secondary);
        border-bottom: 1px solid var(--color-border-subtle);
        padding-bottom: 0.25rem;
    }

    .empty-state {
        font-style: italic;
        color: var(--color-text-tertiary);
        font-size: 0.9rem;
    }

    .item-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .item-list li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        background: var(--color-background-primary);
        border: 1px solid var(--color-border-subtle);
        border-radius: 4px;
        transition:
            border-color 0.2s,
            background-color 0.2s;
    }

    .item-list li:hover {
        border-color: var(--color-accent-primary);
    }

    .item-list li.active {
        background-color: var(--color-background-tertiary);
        border-color: var(--color-accent-primary);
        box-shadow: inset 2px 0 0 var(--color-accent-primary);
    }

    .item-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
        min-width: 0; /* Enable truncation */
    }

    .item-icon {
        font-size: 1.2rem;
        min-width: 24px;
        text-align: center;
    }

    .item-label {
        font-size: 0.9rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .item-actions {
        display: flex;
        gap: 0.25rem;
    }

    .action-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 1rem;
        opacity: 0.6;
        padding: 0.25rem;
        border-radius: 4px;
    }

    .action-btn:hover {
        opacity: 1;
        background-color: var(--color-background-tertiary);
    }

    .action-btn.delete:hover {
        color: var(--color-status-error);
    }
</style>
