/**
 * @file This file contains shared TypeScript type definitions used across multiple
 * Svelte components in the application. It helps ensure consistency for
 * complex, shared data structures.
 *
 * For types that mirror backend data structures, see `bindings.ts`.
 * For Infobox types, see `infobox.ts`.
 */

import type { FileNode } from "./bindings";

// --- Context Menu Types ---

/** A standard action item in the context menu. */
export type MenuAction = {
    label: string;
    handler: () => void;
    /**
     * If defined, the item represents a toggleable setting and a checkmark
     * is shown on the left when `true`. Items without `checked` render as
     * plain action rows (no leading column).
     */
    checked?: boolean;
    isSeparator?: undefined;
};

/** A separator line in the context menu. */
export type MenuSeparator = {
    isSeparator: true;
    label?: undefined;
    handler?: undefined;
};

/** A union type representing any possible item in the context menu. */
export type ContextMenuItem = MenuAction | MenuSeparator;

/** The function signature for the event handler that opens the context menu. */
export type ContextMenuHandler = (event: MouseEvent, node: FileNode) => void;
