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
    position: { above: string };
};

/** A rule to group multiple fields together and render them in a specific way. */
export type LayoutGroup = {
    type: "group";
    render_as: "columns"; // This can be extended in the future, e.g., 'rows'
    keys: string[];
};

/** A union type for any possible layout rule. */
export type LayoutItem = LayoutHeader | LayoutGroup;

/** A union type representing the final, structured items to be rendered by the template. */
export type RenderItem =
    | { type: "header"; text: string }
    | {
          type: "group";
          render_as: "columns";
          // CHANGE: This now holds an array of the group's *values* only, not key-value pairs.
          items: any[];
      }
    | { type: "default"; item: [string, any] }; // A single default key-value pair
