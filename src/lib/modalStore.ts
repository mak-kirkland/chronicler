import { writable } from "svelte/store";
import type { Component } from "svelte";

/**
 * Defines the contract for opening a modal.
 * It specifies the component to render and the props to pass to it.
 */
export interface ModalData {
    component: Component<any>;
    props: Record<string, unknown>;
}

/**
 * This is the central store for managing all modals in the application.
 * Instead of each component tracking its own modal's visibility (e.g., `showRenameModal`),
 * we have a single source of truth.
 *
 * It can hold one of two values:
 * - `null`: No modal is currently active.
 * - `ModalData`: An object that describes the modal that should be displayed.
 */
export const activeModal = writable<ModalData | null>(null);

/**
 * A convenience function to open a modal.
 * This is the "request" to show a modal. Any component can call this.
 *
 * @param data The "order ticket" for the modal, specifying which Svelte component
 * to render and what props to pass to it. This data object must match the
 * `ModalData` interface.
 */
export function openModal(data: ModalData) {
    activeModal.set(data);
}

/**
 * A convenience function to close any currently active modal by resetting the store to null.
 */
export function closeModal() {
    activeModal.set(null);
}
