<script lang="ts">
    import type { MapLayer } from "$lib/mapModels";

    let { layers, onToggle, onOpacityChange } = $props<{
        layers: MapLayer[];
        onToggle: (layerId: string, visible: boolean) => void;
        onOpacityChange: (layerId: string, opacity: number) => void;
    }>();

    let isOpen = $state(false);

    // Sort layers by zIndex (descending) so top layers appear first in the list
    let sortedLayers = $derived(
        [...layers].sort((a, b) => b.zIndex - a.zIndex),
    );

    // --- Navigation Logic ---
    // Finds the currently "active" layer (the highest visible one) to determine up/down targets
    function handleNavigate(direction: "up" | "down") {
        // 1. Find the highest visible layer index in our sorted list
        const activeIndex = sortedLayers.findIndex((l) => l.visible);

        if (activeIndex === -1) {
            // No layers visible? Enable the base (bottom-most) layer
            const base = sortedLayers[sortedLayers.length - 1];
            if (base) onToggle(base.id, true);
            return;
        }

        let targetIndex = -1;

        if (direction === "up") {
            // "Up" means going to a HIGHER zIndex, which is a LOWER index in our sorted-descending array
            if (activeIndex > 0) {
                targetIndex = activeIndex - 1;
            }
        } else {
            // "Down" means going to a LOWER zIndex, which is a HIGHER index in our sorted-descending array
            if (activeIndex < sortedLayers.length - 1) {
                targetIndex = activeIndex + 1;
            }
        }

        if (targetIndex !== -1) {
            const currentLayer = sortedLayers[activeIndex];
            const nextLayer = sortedLayers[targetIndex];

            // "Solo" mode: Disable current, Enable next
            onToggle(currentLayer.id, false);
            onToggle(nextLayer.id, true);
        }
    }

    // Computed states for disabling buttons
    let canGoUp = $derived.by(() => {
        const activeIndex = sortedLayers.findIndex((l) => l.visible);
        return activeIndex > 0; // If 0, we are at top
    });

    let canGoDown = $derived.by(() => {
        const activeIndex = sortedLayers.findIndex((l) => l.visible);
        // If -1 (none visible), we can "go down" to base (conceptually starting over) or just handle as special case
        // Logic: activeIndex < length-1 means there is something below
        return activeIndex !== -1 && activeIndex < sortedLayers.length - 1;
    });
</script>

<!-- Only show if we have more than one layer (base + at least one overlay) -->
{#if layers.length > 1}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="layer-control-container"
        class:open={isOpen}
        onmouseleave={() => (isOpen = false)}
    >
        <div class="main-controls">
            <!-- Navigation Arrows -->
            <div class="nav-stack">
                <button
                    class="nav-btn"
                    disabled={!canGoUp}
                    onclick={() => handleNavigate("up")}
                    title="Go up a layer">▲</button
                >
                <button
                    class="nav-btn"
                    disabled={!canGoDown}
                    onclick={() => handleNavigate("down")}
                    title="Go down a layer">▼</button
                >
            </div>

            <button
                class="layer-toggle-btn"
                onclick={() => (isOpen = !isOpen)}
                title="Manage Layers"
                aria-label="Toggle Layer List"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                    <polyline points="2 17 12 22 22 17"></polyline>
                    <polyline points="2 12 12 17 22 12"></polyline>
                </svg>
            </button>
        </div>

        {#if isOpen}
            <div class="layer-dropdown">
                {#each sortedLayers as layer}
                    <div class="layer-item">
                        <label class="toggle-row">
                            <input
                                type="checkbox"
                                checked={layer.visible}
                                onchange={(e) =>
                                    onToggle(layer.id, e.currentTarget.checked)}
                            />
                            <span class="layer-name" title={layer.name}
                                >{layer.name}</span
                            >
                        </label>
                        {#if layer.visible}
                            <div class="opacity-row">
                                <input
                                    type="range"
                                    class="opacity-slider"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={layer.opacity}
                                    oninput={(e) =>
                                        onOpacityChange(
                                            layer.id,
                                            parseFloat(e.currentTarget.value),
                                        )}
                                    title={`Opacity: ${Math.round(layer.opacity * 100)}%`}
                                />
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </div>
{/if}

<style>
    .layer-control-container {
        position: absolute;
        top: 10px;
        left: 10px; /* Moved to Left to avoid Zoom Control (Top Right) */
        z-index: 1000; /* Leaflet controls usually sit around 1000 */
        background: transparent;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        font-family: var(--font-family-body);
        color: var(--color-text-primary);
    }

    .main-controls {
        display: flex;
        gap: 0.25rem;
        background: var(--color-background-secondary);
        border: 2px solid var(--color-border-primary);
        border-radius: 4px;
        box-shadow: 0 1px 5px rgba(0, 0, 0, 0.4);
        padding: 2px;
    }

    .nav-stack {
        display: flex;
        flex-direction: column;
        border-right: 1px solid var(--color-border-primary);
        padding-right: 2px;
    }

    .nav-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 0.7rem;
        line-height: 1;
        padding: 2px 4px;
        color: var(--color-text-secondary);
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .nav-btn:hover:not(:disabled) {
        background-color: var(--color-background-tertiary);
        color: var(--color-text-primary);
    }
    .nav-btn:disabled {
        opacity: 0.3;
        cursor: default;
    }

    .layer-control-container.open .main-controls {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        border-bottom: none; /* Merge with dropdown */
    }

    .layer-toggle-btn {
        width: 34px; /* Matches standard Leaflet control size */
        height: 34px;
        background: var(--color-background-secondary);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 2px;
        transition: background 0.2s;
        padding: 0;
        color: var(--color-text-primary);
    }

    .layer-toggle-btn:hover {
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
    }

    .layer-dropdown {
        padding: 0.5rem 0.75rem;
        min-width: 200px;
        background: var(--color-background-secondary);
        border: 2px solid var(--color-border-primary);
        border-top: 1px solid var(--color-border-primary);
        border-radius: 0 4px 4px 4px;
        box-shadow: 0 4px 5px rgba(0, 0, 0, 0.2);
        margin-top: -2px; /* Overlap border */
    }

    .layer-item {
        margin-bottom: 0.75rem;
    }
    .layer-item:last-child {
        margin-bottom: 0;
    }

    .toggle-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
        color: var(--color-text-primary);
    }

    .layer-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .opacity-row {
        padding-left: 1.4rem; /* Indent to align with text */
        display: flex;
        align-items: center;
    }

    .opacity-slider {
        width: 100%;
        height: 4px;
        display: block;
        accent-color: var(--color-accent-primary);
        cursor: pointer;
    }
</style>
