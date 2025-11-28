/**
 * @file This file contains shared TypeScript type definitions used across multiple
 * Svelte components in the application. It helps ensure consistency for
 * complex, shared data structures.
 *
 * For types that mirror backend data structures, see `bindings.ts`.
 */

import type { FileNode } from "./bindings";

// --- Context Menu Types ---

/** A standard action item in the context menu. */
export type MenuAction = {
    label: string;
    handler: () => void;
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

// --- Infobox Layout Types ---

/** The complete data object for the infobox, including optional layout rules. */
export type InfoboxData = {
    layout?: LayoutItem[];
    [key: string]: any;
};

/** A rule to inject a header into the infobox layout. */
export type LayoutHeader = {
    type: "header";
    text: string;
    above?: string;
    below?: string;
};

/** A rule to inject a horizontal line into the infobox layout. */
export type LayoutSeparator = {
    type: "separator";
    // Separators can be reused, so we allow arrays to inject them in multiple places.
    above?: string | string[];
    below?: string | string[];
};

/** A rule to group multiple fields together. */
export type LayoutGroup = {
    type: "group" | "columns";
    keys: string[];
};

/** A union type for any possible layout rule. */
export type LayoutItem = LayoutHeader | LayoutGroup | LayoutSeparator;

/** A union type representing the final, structured items to be rendered by the infobox. */
export type RenderItem =
    | { type: "header"; text: string }
    | { type: "separator" }
    | {
          type: "group";
          // This holds an array of the group's *values*
          items: any[];
      }
    | { type: "default"; item: [string, any] }; // A single default key-value pair
