<script lang="ts">
    import type { MapData, MapPin, PageHeader } from "$lib/bindings";
    import { onMount } from "svelte";
    import panzoom from "panzoom";
    import { getMapData, getImageAsBase64, updateMapData } from "$lib/commands";
    import ViewHeader from "./ViewHeader.svelte";
    import ErrorBox from "./ErrorBox.svelte";
    import AddPinModal from "./AddPinModal.svelte";
    import MapPinComponent from "./MapPin.svelte";
    import { openModal, closeModal } from "$lib/modalStore";

    let { data: mapHeader } = $props<{ data: PageHeader }>();

    let mapData = $state<MapData | null>(null);
    let imageUrl = $state<string | null>(null);
    let error = $state<string | null>(null);
    let isLoading = $state(true);

    // This will be the element we apply panzoom to
    let panzoomContainer: HTMLDivElement | undefined = $state();

    $effect(() => {
        // Reset state when the map changes
        mapData = null;
        imageUrl = null;
        error = null;
        isLoading = true;

        async function loadMap() {
            try {
                const data = await getMapData(mapHeader.path);
                const imageBase64 = await getImageAsBase64(data.image_path);
                mapData = data;
                imageUrl = imageBase64;
            } catch (e: any) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                error = `Failed to load map data: ${errorMessage}`;
            } finally {
                isLoading = false;
            }
        }
        loadMap();
    });

    onMount(() => {
        if (panzoomContainer) {
            const panzoomInstance = panzoom(panzoomContainer, {
                maxZoom: 10,
                minZoom: 0.1,
                // Disable the default double-click zoom behavior
                onDoubleClick: function (e) {
                    return false;
                },
            });

            return () => {
                panzoomInstance.dispose();
            };
        }
    });

    function handleDoubleClick(event: MouseEvent) {
        if (!panzoomContainer || !mapData) return;

        const panzoomInstance = panzoom(panzoomContainer);
        const transform = panzoomInstance.getTransform();
        const rect = panzoomContainer.getBoundingClientRect();

        // Calculate the mouse position relative to the container,
        // then adjust for the current pan and zoom to find the point on the image.
        const x = (event.clientX - rect.left - transform.x) / transform.scale;
        const y = (event.clientY - rect.top - transform.y) / transform.scale;

        // Normalize coordinates to be a percentage (0 to 1)
        const normalizedX = x / panzoomContainer.offsetWidth;
        const normalizedY = y / panzoomContainer.offsetHeight;

        openModal({
            component: AddPinModal,
            props: {
                mapData,
                coords: { x: normalizedX, y: normalizedY },
                onClose: closeModal,
                onSave: handleSave,
            },
        });
    }

    async function handleSave(pin: MapPin) {
        if (!mapData) return;
        const existingIndex = mapData.pins.findIndex((p) => p.id === pin.id);
        if (existingIndex !== -1) {
            mapData.pins[existingIndex] = pin; // Update existing
        } else {
            mapData.pins.push(pin); // Add new
        }

        try {
            await updateMapData(mapHeader.path, mapData);
            mapData = { ...mapData }; // Force reactivity
        } catch (e: any) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            alert(`Failed to save map changes: ${errorMessage}`);
        }
    }
</script>

<div class="map-view-container">
    <ViewHeader>
        <div slot="left">
            <h2>{mapHeader.title}</h2>
        </div>
    </ViewHeader>

    <div class="map-content" ondblclick={handleDoubleClick}>
        {#if isLoading}
            <p>Loading map...</p>
        {:else if error}
            <ErrorBox>{error}</ErrorBox>
        {:else if imageUrl && mapData}
            <div class="panzoom-wrapper">
                <div class="panzoom-target" bind:this={panzoomContainer}>
                    <img src={imageUrl} alt={mapData.title} />
                    {#each mapData.pins as pin (pin.id)}
                        <MapPinComponent {pin} {mapData} onSave={handleSave} />
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .map-view-container {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
    }
    .map-content {
        flex-grow: 1;
        overflow: hidden;
        position: relative;
        background-color: var(--color-background-secondary);
        cursor: grab;
    }
    .map-content:active {
        cursor: grabbing;
    }
    .panzoom-wrapper {
        width: 100%;
        height: 100%;
    }
    .panzoom-target {
        position: relative; /* Establishes a coordinate system for the pins */
    }
    img {
        display: block;
        max-width: none;
    }
</style>
