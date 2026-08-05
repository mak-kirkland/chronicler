/**
 * @file UI state and navigation stores — not the core application data (managed
 * by worldStore.ts) nor the app's lifecycle state (managed in appState.ts). The
 * core here is the `tabs` store: a list of open tabs, each with its own
 * back/forward history. `currentView` is a derived read-only view of the active
 * tab (kept for existing read sites), and `navigation` is a thin facade over the
 * active tab's history.
 */
import { writable, derived, type Readable } from "svelte/store";
import * as T from "./tabs";
import type { TabsState, ViewState, OpenOptions, PathViewKind } from "./tabs";

// Re-export the shared types so existing `$lib/viewStores` type imports keep working.
export type { ViewState, Tab, FileViewMode, PathViewKind } from "./tabs";
export type SaveStatus = "idle" | "dirty" | "saving" | "error";

let idCounter = 0;
const makeId = () => `tab-${idCounter++}`;

function createTabsStore() {
    let current = T.createInitialState(makeId());
    const { subscribe, set } = writable<TabsState>(current);

    /**
     * Apply a pure-model op, and stay silent when it changed nothing.
     *
     * The model in tabs.ts deliberately returns the IDENTICAL state object for
     * a no-op — clicking the tab that's already active, focusing the pane
     * that's already focused, navigating to the page you're already on. Svelte's
     * `safe_not_equal` reports any two objects as different, so handing that
     * same object to `set` would still notify every subscriber and re-render
     * every mounted pane for nothing. Honouring the model's contract once, here,
     * saves each call site from guarding its own no-ops.
     */
    const update = (fn: (s: TabsState) => TabsState) => {
        const next = fn(current);
        if (next === current) return;
        current = next;
        set(next);
    };

    return {
        subscribe,
        openInCurrent: (view: ViewState) =>
            update((s) => T.openInCurrent(s, view)),
        openInNew: (view: ViewState, opts?: OpenOptions) =>
            update((s) => T.openInNew(s, view, makeId(), opts)),
        newBlankTab: () => update((s) => T.newBlankTab(s, makeId())),
        activate: (id: string) => update((s) => T.activate(s, id)),
        close: (id: string) => update((s) => T.closeTab(s, id, makeId)),
        closeActive: () =>
            update((s) => T.closeTab(s, T.activeIdOf(s), makeId)),
        closeOthers: (id: string) => update((s) => T.closeOthers(s, id)),
        closeAll: () => update((s) => T.closeAll(s, makeId)),
        split: () => update((s) => T.splitView(s, makeId)),
        closePane: (paneIndex: number) =>
            update((s) => T.closePane(s, paneIndex)),
        focusPane: (paneIndex: number) =>
            update((s) => T.focusPane(s, paneIndex)),
        back: () => update((s) => T.back(s)),
        forward: () => update((s) => T.forward(s)),
        nextTab: () => update((s) => T.nextTab(s)),
        prevTab: () => update((s) => T.prevTab(s)),
        jumpToIndex: (idx: number) => update((s) => T.jumpToIndex(s, idx)),
        applyRename: (
            oldPath: string,
            newPath: string,
            newTitle: string,
            kindOf: (p: string) => PathViewKind,
        ) =>
            update((s) => T.applyRename(s, oldPath, newPath, newTitle, kindOf)),
        applyDelete: (path: string) =>
            update((s) => T.applyDelete(s, path, makeId)),
        // Goes through `update` too, so `current` stays in sync with the store.
        reset: () => update(() => T.createInitialState(makeId())),
    };
}

export const tabs = createTabsStore();

/** The active tab's current view. Read-only — write via `tabs.*`. */
export const currentView: Readable<ViewState> = derived(tabs, (s) =>
    T.currentViewOf(T.getActiveTab(s)),
);

/** The active (focused-pane) tab id, for highlighting in the tab bar / sidebar. */
export const activeTabId: Readable<string> = derived(tabs, (s) =>
    T.activeIdOf(s),
);

/** The 1 or 2 displayed tab ids, left→right. Length 2 means the view is split. */
export const displayedPanes: Readable<string[]> = derived(tabs, (s) => s.panes);

/** Whether two panes are shown side by side. */
export const isViewSplit: Readable<boolean> = derived(tabs, (s) =>
    T.isSplit(s),
);

/**
 * Back/forward facade over the ACTIVE tab's history. `ViewHeader` and
 * `keybindings` use this unchanged.
 */
export const navigation = {
    subscribe: derived(tabs, (s) => ({
        canGoBack: T.canGoBack(s),
        canGoForward: T.canGoForward(s),
    })).subscribe,
    back: tabs.back,
    forward: tabs.forward,
    reset: tabs.reset,
};

/** Per-tab save status (id -> status), reported by FileView, read by TabBar. */
function createTabStatusStore() {
    const { subscribe, update } = writable<Record<string, SaveStatus>>({});
    return {
        subscribe,
        set: (id: string, status: SaveStatus) =>
            update((m) => (m[id] === status ? m : { ...m, [id]: status })),
        clear: (id: string) =>
            update((m) => {
                const next = { ...m };
                delete next[id];
                return next;
            }),
    };
}

export const tabStatus = createTabStatusStore();

/** Resets all UI stores. Used when changing vaults. */
export function resetAllStores() {
    tabs.reset();
}
