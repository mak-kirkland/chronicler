<script lang="ts">
    import type { MapData, MapPin } from "$lib/bindings";
    import { navigateToPage } from "$lib/actions";
    import ContextMenu from "./ContextMenu.svelte";
    import type { ContextMenuItem } from "$lib/types";
    import { openModal, closeModal } from "$lib/modalStore";
    import AddPinModal from "./AddPinModal.svelte";
    import ConfirmModal from "./ConfirmModal.svelte";
    import { fileStemString } from "$lib/utils";

    let { pin, mapData, onSave } = $props<{
        pin: MapPin;
        mapData: MapData;
        onSave: (pin: MapPin) => void;
    }>();

    type ContextMenuState = { x: number; y: number };
    let contextMenu = $state<ContextMenuState | null>(null);

    function showContextMenu(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        contextMenu = { x: event.clientX, y: event.clientY };
    }

    function closeContextMenu() {
        contextMenu = null;
    }

    function handlePinClick() {
        if (pin.linked_page_path) {
            const title = fileStemString(pin.linked_page_path);
            navigateToPage({
                path: pin.linked_page_path,
                title: title,
            });
        }
    }

    async function handleDelete() {
        mapData.pins = mapData.pins.filter((p) => p.id !== pin.id);
        // Call onSave with a dummy pin object; the main effect is updating the mapData
        // which will be saved by the parent.
        onSave({} as MapPin);
    }

    const contextMenuActions: ContextMenuItem[] = [
        {
            label: "Edit Pin",
            handler: () => {
                openModal({
                    component: AddPinModal,
                    props: {
                        mapData,
                        pinToEdit: pin,
                        onClose: closeModal,
                        onSave: onSave,
                    },
                });
            },
        },
        {
            label: "Delete Pin",
            handler: () => {
                openModal({
                    component: ConfirmModal,
                    props: {
                        title: "Delete Pin",
                        message: `Are you sure you want to delete the pin "${pin.name}"?`,
                        onClose: closeModal,
                        onConfirm: () => {
                            handleDelete();
                            closeModal();
                        },
                    },
                });
            },
        },
    ];
</script>

{#if contextMenu}
    <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        actions={contextMenuActions}
        onClose={closeContextMenu}
    />
{/if}

<button
    class="map-pin"
    style="--pin-color: {pin.color}; left: {pin.x * 100}%; top: {pin.y * 100}%;"
    title={pin.name}
    onclick={handlePinClick}
    oncontextmenu={showContextMenu}
>
    {#if pin.icon === "default"}
        <div class="pin-dot"></div>
    {:else}
        <span class="pin-icon">{pin.icon}</span>
    {/if}
</button>

<style>
    .map-pin {
        position: absolute;
        transform: translate(-50%, -50%);
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background-color: var(--pin-color, #ff0000);
        border: 2px solid var(--color-background-primary);
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease;
        padding: 0;
    }
    .map-pin:hover {
        transform: translate(-50%, -50%) scale(1.2);
        z-index: 10;
    }
    .pin-dot {
        width: 12px;
        height: 12px;
        background-color: var(--color-background-primary);
        border-radius: 50%;
    }
    .pin-icon {
        font-size: 16px;
    }
</style>
