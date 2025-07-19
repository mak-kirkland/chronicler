import { writable } from "svelte/store";

/**
 * A simple boolean store that is true when a drag operation is in progress.
 * This allows components to react globally to drag events.
 */
export const isDragging = writable(false);
