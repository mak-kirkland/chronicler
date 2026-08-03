/**
 * @file This file contains shared TypeScript type definitions used across multiple
 * Svelte components in the application. It helps ensure consistency for
 * complex, shared data structures.
 *
 * For types that mirror backend data structures, see `bindings.ts`.
 * For Infobox types, see `infobox.ts`.
 */

import type { FileNode } from "./bindings";
import type { IconType } from "./icons";

// --- Context Menu Types ---

/** A standard action item in a menu. */
export type MenuAction = {
    label: string;
    handler: () => void;
    /**
     * Optional leading icon. Shares the leading column with `checked`, so an
     * item is either an icon row or a toggle row, never both.
     */
    icon?: IconType;
    /**
     * If defined, the item represents a toggleable setting and a checkmark
     * is shown on the left when `true`.
     */
    checked?: boolean;
    /** Optional `title` attribute, for a row whose label is truncated. */
    title?: string;
    isSeparator?: undefined;
    isHeading?: undefined;
};

/** A separator line between groups of items. */
export type MenuSeparator = {
    isSeparator: true;
    label?: undefined;
    handler?: undefined;
    icon?: undefined;
    checked?: undefined;
    title?: undefined;
    isHeading?: undefined;
};

/** A small-caps label over a group of items. Not focusable. */
export type MenuHeading = {
    isHeading: true;
    label: string;
    handler?: undefined;
    icon?: undefined;
    checked?: undefined;
    title?: undefined;
    isSeparator?: undefined;
};

/**
 * Any row a menu can render.
 *
 * Named for the context menu because that's where it started, but it is the
 * shared vocabulary for every action menu in the app — see `MenuList.svelte`.
 */
export type ContextMenuItem = MenuAction | MenuSeparator | MenuHeading;

/** The function signature for the event handler that opens the context menu. */
export type ContextMenuHandler = (event: MouseEvent, node: FileNode) => void;
