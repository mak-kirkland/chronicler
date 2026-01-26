<script lang="ts">
    import { writePageContent } from "$lib/commands";
    import { registerMap } from "$lib/mapStore";
    import type { MapConfig, MapPin, MapRegion } from "$lib/mapModels";
    import { openModal, closeModal } from "$lib/modalStore";
    import AddPinModal from "./AddPinModal.svelte";
    import AddRegionModal from "./AddRegionModal.svelte";
    import ConfirmModal from "./ConfirmModal.svelte";
    import Button from "./Button.svelte";

    let { mapConfig, mapPath, onClose, onHoverPin, onHoverRegion } = $props<{
        mapConfig: MapConfig;
        mapPath: string;
        onClose: () => void;
        onHoverPin?: (pinId: string | null) => void;
        onHoverRegion?: (regionId: string | null) => void;
    }>();

    let pins = $derived(mapConfig.pins || []);
    let regions = $derived(mapConfig.shapes || []);

    function handleEditPin(pin: MapPin) {
        openModal({
            component: AddPinModal,
            props: {
                onClose: closeModal,
                mapPath: mapPath,
                mapConfig: mapConfig,
                existingPin: pin,
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
                        const updatedConfig = {
                            ...mapConfig,
                            pins: (mapConfig.pins || []).filter(
                                (p) => p.id !== pinId,
                            ),
                        };
                        await writePageContent(
                            mapPath,
                            JSON.stringify(updatedConfig, null, 2),
                        );
                        registerMap(mapPath, updatedConfig);
                        closeModal();
                    } catch (e) {
                        alert("Failed to delete pin.");
                    }
                },
            },
        });
    }

    function handleEditRegion(region: MapRegion) {
        openModal({
            component: AddRegionModal,
            props: {
                onClose: closeModal,
                mapPath: mapPath,
                mapConfig: mapConfig,
                existingRegion: region,
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
                        const updatedConfig = {
                            ...mapConfig,
                            shapes: (mapConfig.shapes || []).filter(
                                (s) => s.id !== regionId,
                            ),
                        };
                        await writePageContent(
                            mapPath,
                            JSON.stringify(updatedConfig, null, 2),
                        );
                        registerMap(mapPath, updatedConfig);
                        closeModal();
                    } catch (e) {
                        alert("Failed to delete region.");
                    }
                },
            },
        });
    }
</script>

<div class="map-console">
    <div class="console-header">
        <h3>Map Console</h3>
        <Button variant="ghost" size="small" onclick={onClose}>×</Button>
    </div>

    <div class="console-content">
        <!-- PINS SECTION -->
        <div class="section">
            <h4>Pins ({pins.length})</h4>
            {#if pins.length === 0}
                <p class="empty-state">No pins yet.</p>
            {:else}
                <ul class="item-list">
                    {#each pins as pin}
                        <li
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
                                        <span title="Invisible Pin">👻</span>
                                    {:else}
                                        {pin.icon || "📍"}
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
                <p class="empty-state">No regions defined.</p>
            {:else}
                <ul class="item-list">
                    {#each regions as region}
                        <li
                            onmouseenter={() => onHoverRegion?.(region.id)}
                            onmouseleave={() => onHoverRegion?.(null)}
                        >
                            <div class="item-info">
                                <span
                                    class="item-icon"
                                    style="color: {region.color || '#3498db'}"
                                >
                                    {#if region.type === "circle"}
                                        ⚪
                                    {:else}
                                        ⬠
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
        padding: 1rem;
        border-bottom: 1px solid var(--color-border-primary);
        background: var(--color-background-primary);
    }

    .console-header h3 {
        margin: 0;
        font-size: 1.1rem;
        color: var(--color-text-heading);
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
        transition: border-color 0.2s;
    }

    .item-list li:hover {
        border-color: var(--color-accent-primary);
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
