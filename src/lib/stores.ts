/**
 * @file This file contains stores related to UI state and navigation,
 * not the core application data, which is managed by worldStore.ts.
 */

import { writable, type Writable } from "svelte/store";
import type { PageHeader } from "./bindings";

// --- Application Status & View Management ---

/**
 * Represents the overall status of the application, determining which main view to show.
 */
export type AppStatus = "selecting_vault" | "loading" | "ready" | "error";

/**
 * Manages the application's current status.
 */
export const appStatus = writable<AppStatus>("selecting_vault");

/**
 * A union type to represent the possible states of the main view.
 */
export type ViewState =
    | { type: "welcome" }
    | { type: "tag"; tagName: string }
    | { type: "file"; data: PageHeader | null };

/**
 * This store manages what is currently displayed in the main content area.
 * It defaults to the 'welcome' screen.
 */
export const currentView: Writable<ViewState> = writable({ type: "welcome" });

/**
 * This store manages the view mode (split or preview) for files.
 */
export const fileViewMode: Writable<"preview" | "split"> = writable("preview");

// --- Right Sidebar State ---

interface RightSidebarState {
    isVisible: boolean;
    backlinks: PageHeader[];
}

const initialRightSidebarState: RightSidebarState = {
    isVisible: false,
    backlinks: [],
};

/**
 * Manages the state of the right-hand metadata panel (for backlinks, etc.).
 */
export const rightSidebar = writable<RightSidebarState>(
    initialRightSidebarState,
);

/**
 * Resets all UI-related data stores to their initial state.
 * This is useful when changing vaults.
 */
export function resetAllStores() {
    currentView.set({ type: "welcome" });
    fileViewMode.set("preview");
    rightSidebar.set(initialRightSidebarState);
}
