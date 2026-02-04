/**
 * @file This file implements a centralized store for managing all modals in the application.
 * Instead of each component tracking its own modal's visibility, this store provides a
 * single source of truth (`activeModal`). Any component can request to open a modal
 * by providing a component to render and its props, which simplifies state management
 * and ensures only one modal can be active at a time.
 *
 * The store now supports a modal stack, enabling "back" navigation when opening
 * modals from within other modals.
 */

import { writable, derived } from "svelte/store";
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
 * The modal stack - stores all open modals in order.
 * The last item in the array is the currently visible modal.
 * This is internal; consumers should use `activeModal` for reading.
 */
const modalStack = writable<ModalData[]>([]);

/**
 * This is the central store for managing all modals in the application.
 * Instead of each component tracking its own modal's visibility (e.g., `showRenameModal`),
 * we have a single source of truth.
 *
 * It can hold one of two values:
 * - `null`: No modal is currently active.
 * - `ModalData`: An object that describes the modal that should be displayed.
 *
 * This is now a derived store that returns the topmost modal from the stack,
 * maintaining backwards compatibility with existing code.
 */
export const activeModal = derived(modalStack, ($stack) => {
    if ($stack.length === 0) return null;
    return $stack[$stack.length - 1];
});

/**
 * Derived store that returns the current stack depth.
 * Useful for determining if a back button should be shown (depth > 1).
 */
export const modalStackDepth = derived(modalStack, ($stack) => $stack.length);

/**
 * Opens a modal by pushing it onto the stack.
 *
 * - If no modal is open, this starts a new stack with this modal.
 * - If a modal is already open, this pushes on top, enabling "back" navigation.
 *
 * This unified behavior means you don't need to think about whether you're
 * opening from "outside" or "inside" a modal — it just works.
 *
 * @param data The "order ticket" for the modal, specifying which Svelte component
 * to render and what props to pass to it.
 */
export function openModal(data: ModalData) {
    modalStack.update((stack) => [...stack, data]);
}

/**
 * Pops the topmost modal from the stack, revealing the one beneath.
 * Used by the back button for navigation within the modal stack.
 * If it's the last modal, closes everything.
 */
export function popModal() {
    modalStack.update((stack) => {
        if (stack.length <= 1) {
            // Last modal or empty - clear the stack
            return [];
        }
        // Pop the top modal, revealing the one beneath
        return stack.slice(0, -1);
    });
}

/**
 * Closes all modals, clearing the entire stack.
 * Used when the user clicks the X button, clicks the backdrop, or presses Escape.
 */
export function closeModal() {
    modalStack.set([]);
}
