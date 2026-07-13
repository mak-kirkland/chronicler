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
import type { TabsState, ViewState, OpenOptions } from "./tabs";

// Re-export the shared types so existing `$lib/viewStores` type imports keep working.
export type { ViewState, Tab, FileViewMode } from "./tabs";
export type SaveStatus = "idle" | "dirty" | "saving" | "error";

let idCounter = 0;
const makeId = () => `tab-${idCounter++}`;

function createTabsStore() {
    const { subscribe, update, set } = writable<TabsState>(
        T.createInitialState(makeId()),
    );
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
            kindOf: (
                p: string,
            ) => "file" | "image" | "map" | "canvas" | "timeline",
        ) =>
            update((s) => T.applyRename(s, oldPath, newPath, newTitle, kindOf)),
        applyDelete: (path: string) =>
            update((s) => T.applyDelete(s, path, makeId)),
        reset: () => set(T.createInitialState(makeId())),
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

/** Index into `displayedPanes` of the focused pane. */
export const focusedPaneIndex: Readable<number> = derived(
    tabs,
    (s) => s.focused,
);

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
