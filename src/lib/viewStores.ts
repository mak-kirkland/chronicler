/**
 * @file This file contains stores related to UI state and navigation,
 * not the core application data, which is managed by worldStore.ts, or the
 * application's core lifecycle state, which is managed in appState.ts.
 */

import { writable, type Writable, get, derived } from "svelte/store";
import type { PageHeader, Backlink } from "./bindings";

// --- View Management ---

/**
 * A union type to represent the possible states of the main view.
 */
export type ViewState =
    | { type: "welcome" }
    | { type: "tag"; tagName: string }
    | { type: "file"; data: PageHeader | null; sectionId?: string | null }
    | { type: "image"; data: PageHeader | null }
    | { type: "map"; data: PageHeader | null }
    | { type: "report"; name: string };

/**
 * This store manages what is currently displayed in the main content area.
 * It defaults to the 'welcome' screen.
 */
export const currentView: Writable<ViewState> = writable({ type: "welcome" });

/**
 * This store manages the view mode (split, preview, or editor) for files.
 */
export const fileViewMode: Writable<"preview" | "split" | "editor"> =
    writable("preview");

// --- Right Sidebar State ---

interface RightSidebarState {
    isVisible: boolean;
    backlinks: Backlink[];
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

// --- Navigation History Store ---

function createNavigationStore() {
    const history = writable<ViewState[]>([{ type: "welcome" }]);
    const currentIndex = writable(0);
    let isNavigating = false; // Flag to prevent history push on back/forward

    // Subscribe to changes in the main view store
    currentView.subscribe((view) => {
        if (isNavigating) {
            isNavigating = false;
            return;
        }

        const currentHistory = get(history);
        const currentIdx = get(currentIndex);

        // If the new view is the same as the current one, do nothing.
        if (
            JSON.stringify(view) === JSON.stringify(currentHistory[currentIdx])
        ) {
            return;
        }

        history.update((h) => {
            // If we've navigated back and then choose a new page,
            // we should discard the "forward" history.
            if (currentIdx < h.length - 1) {
                h.splice(currentIdx + 1);
            }
            h.push(view);
            currentIndex.set(h.length - 1);
            return h;
        });
    });

    function back() {
        const currentIdx = get(currentIndex);
        if (currentIdx > 0) {
            isNavigating = true;
            currentIndex.update((n) => n - 1);
            currentView.set(get(history)[get(currentIndex)]);
        }
    }

    function forward() {
        const currentIdx = get(currentIndex);
        const currentHistory = get(history);
        if (currentIdx < currentHistory.length - 1) {
            isNavigating = true;
            currentIndex.update((n) => n + 1);
            currentView.set(get(history)[get(currentIndex)]);
        }
    }

    function reset() {
        history.set([{ type: "welcome" }]);
        currentIndex.set(0);
    }

    const canGoBack = derived(
        currentIndex,
        ($currentIndex) => $currentIndex > 0,
    );
    const canGoForward = derived(
        [currentIndex, history],
        ([$currentIndex, $history]) => $currentIndex < $history.length - 1,
    );

    return {
        subscribe: derived(
            [history, currentIndex, canGoBack, canGoForward],
            ([$history, $currentIndex, $canGoBack, $canGoForward]) => ({
                history: $history,
                currentIndex: $currentIndex,
                canGoBack: $canGoBack,
                canGoForward: $canGoForward,
            }),
        ).subscribe,
        back,
        forward,
        reset,
    };
}

export const navigation = createNavigationStore();

/**
 * Resets all UI-related data stores to their initial state.
 * This is useful when changing vaults.
 */
export function resetAllStores() {
    currentView.set({ type: "welcome" });
    navigation.reset();
    fileViewMode.set("preview");
    rightSidebar.set(initialRightSidebarState);
}
