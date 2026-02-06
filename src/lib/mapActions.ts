/**
 * @file Shared CRUD actions for map objects (pins and regions).
 *
 * Centralizes the modal-opening logic for editing and deleting map objects
 * so that both MapView (context menu) and MapConsole (list buttons) use
 * the same code paths. This eliminates duplicated handlers that can drift.
 */

import { updateMapConfig } from "$lib/mapStore";
import { openModal, closeModal } from "$lib/modalStore";
import MapObjectModal from "$lib/components/map/MapObjectModal.svelte";
import ConfirmModal from "$lib/components/modals/ConfirmModal.svelte";
import type { MapConfig, MapPin, MapRegion } from "$lib/mapModels";

/**
 * Helper to open the MapObjectModal with common props pre-filled.
 */
function openMapObjectModal(
    mapPath: string,
    mapConfig: MapConfig,
    mode: "pin" | "region",
    initialData: Record<string, any>,
) {
    openModal({
        component: MapObjectModal,
        props: { onClose: closeModal, mapPath, mapConfig, mode, initialData },
    });
}

/**
 * Helper to confirm and delete a map object by type.
 */
function confirmAndDelete(
    mapPath: string,
    title: string,
    message: string,
    filterFn: (config: MapConfig) => MapConfig,
) {
    openModal({
        component: ConfirmModal,
        props: {
            title,
            message,
            onClose: closeModal,
            onConfirm: async () => {
                await updateMapConfig(mapPath, filterFn);
                closeModal();
            },
        },
    });
}

/**
 * Opens the MapObjectModal to create a new pin at the given coordinates.
 */
export function addPin(
    mapPath: string,
    mapConfig: MapConfig,
    x: number,
    y: number,
) {
    openMapObjectModal(mapPath, mapConfig, "pin", { x, y });
}

/**
 * Opens the MapObjectModal to edit an existing pin.
 */
export function editPin(mapPath: string, mapConfig: MapConfig, pin: MapPin) {
    openMapObjectModal(mapPath, mapConfig, "pin", pin);
}

/**
 * Opens a confirmation modal and deletes the pin on confirm.
 */
export function deletePin(mapPath: string, pinId: string) {
    confirmAndDelete(
        mapPath,
        "Delete Pin",
        "Are you sure you want to delete this pin?",
        (config) => ({
            ...config,
            pins: config.pins.filter((p) => p.id !== pinId),
        }),
    );
}

/**
 * Opens the MapObjectModal to edit an existing region.
 */
export function editRegion(
    mapPath: string,
    mapConfig: MapConfig,
    region: MapRegion,
) {
    openMapObjectModal(mapPath, mapConfig, "region", region);
}

/**
 * Opens the MapObjectModal to create a new region from drawn shape data.
 */
export function addRegion(
    mapPath: string,
    mapConfig: MapConfig,
    shapeData: any,
) {
    openMapObjectModal(mapPath, mapConfig, "region", { shapeData });
}

/**
 * Opens a confirmation modal and deletes the shape on confirm.
 */
export function deleteShape(mapPath: string, shapeId: string) {
    confirmAndDelete(
        mapPath,
        "Delete Region",
        "Are you sure you want to delete this region?",
        (config) => ({
            ...config,
            shapes: config.shapes.filter((s) => s.id !== shapeId),
        }),
    );
}
