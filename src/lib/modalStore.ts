/**
 * @file This file implements a centralized store for managing all modals in the application.
 * Instead of each component tracking its own modal's visibility, this store provides a
 * single source of truth (`activeModal`). Any component can request to open a modal
 * by providing a component to render and its props, which simplifies state management
 * and ensures only one modal can be active at a time.
 *
 * The store supports a modal stack, enabling "back" navigation when opening
 * modals from within other modals.
 */

import { writable, derived, type Readable } from "svelte/store";
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
 * A modal that is currently on the stack.
 *
 * `id` is assigned when the modal opens and is never reused. `ModalManager`
 * keys its `{#each}` on it, which is what keeps a stacked modal *mounted*:
 * an entry that stays on the stack keeps its component instance — and so its
 * state — when another modal opens on top of it and is later popped off.
 * Without a stable key, going "back" would rebuild the modal underneath and
 * silently discard anything the user had typed into it.
 */
export interface ModalEntry extends ModalData {
    id: number;
}

/**
 * Context key for "is this modal the top of the stack?".
 *
 * `ModalStackEntry` provides it and `Modal` reads it, so that only the visible
 * modal reacts to the Escape key — every mounted modal registers its own
 * `window` keydown listener, and without this guard one press would close the
 * whole stack at once. A `Modal` rendered outside the stack sees no context
 * and treats itself as topmost.
 */
export const MODAL_IS_TOP = Symbol("modal-is-top");

/** Live view of the flag behind {@link MODAL_IS_TOP}. */
export interface ModalTopState {
    readonly current: boolean;
}

let nextId = 0;

/**
 * The modal stack - stores all open modals in order.
 * The last item in the array is the currently visible modal.
 * This is internal; consumers should use `modalStack` or `activeModal`.
 */
const stack = writable<ModalEntry[]>([]);

/**
 * Every open modal, oldest first; the last entry is the visible one.
 *
 * `ModalManager` renders the whole stack and hides all but the last, so that
 * modals underneath stay alive while a modal sits on top of them.
 */
export const modalStack: Readable<ModalEntry[]> = {
    subscribe: stack.subscribe,
};

/**
 * The topmost modal, or `null` when nothing is open.
 *
 * Useful for asking "is a modal open, and which one?". Note this is *not* the
 * full picture of what is mounted — see `modalStack` for that.
 */
export const activeModal = derived(stack, ($stack) => {
    if ($stack.length === 0) return null;
    return $stack[$stack.length - 1];
});

/**
 * Derived store that returns the current stack depth.
 * Useful for determining if a back button should be shown (depth > 1).
 */
export const modalStackDepth = derived(stack, ($stack) => $stack.length);

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
    stack.update((s) => [...s, { ...data, id: nextId++ }]);
}

/**
 * Pops the topmost modal from the stack, revealing the one beneath.
 * Used by the back button for navigation within the modal stack.
 * If it's the last modal, closes everything.
 */
export function popModal() {
    stack.update((s) => {
        if (s.length <= 1) {
            // Last modal or empty - clear the stack
            return [];
        }
        // Pop the top modal, revealing the one beneath
        return s.slice(0, -1);
    });
}

/**
 * Closes all modals, clearing the entire stack.
 * Used when the user clicks the X button, clicks the backdrop, or presses Escape.
 */
export function closeModal() {
    stack.set([]);
}
