/**
 * @file Pure, framework-free tab-state model. All functions take a TabsState
 * and return a new one (never mutate). The Svelte store wrapper lives in
 * viewStores.ts and supplies id generation.
 *
 * A `TabsState` tracks every open tab plus which one or two are *displayed*:
 * `panes` holds the displayed tab ids left→right (length 1 = single view,
 * length 2 = side-by-side split) and `focused` indexes the pane that receives
 * tab clicks and back/forward navigation. `activeIdOf` is the focused pane's
 * tab — the successor to the old single `activeId` field.
 */
import type { PageHeader } from "./bindings";

/** Every possible main-view state. A tab's history is a list of these. */
export type ViewState =
    | { type: "welcome" }
    | { type: "tag"; tagName: string }
    | { type: "file"; data: PageHeader | null; sectionId?: string | null }
    | { type: "image"; data: PageHeader | null }
    | { type: "map"; data: PageHeader | null }
    | { type: "canvas"; data: PageHeader | null }
    | { type: "timeline"; data: PageHeader | null }
    | { type: "report"; name: string };

export type FileViewMode = "preview" | "split" | "editor";

export interface Tab {
    id: string;
    history: ViewState[];
    index: number;
    /** Seed consumed once by FileView on mount (e.g. open a new file in "split"). */
    initialFileMode?: FileViewMode;
}

export interface TabsState {
    tabs: Tab[];
    /** Displayed tab ids, left→right. Length 1 = single view, 2 = split. */
    panes: string[];
    /** Index into `panes` of the focused pane. */
    focused: number;
}

export interface OpenOptions {
    fileMode?: FileViewMode;
}

// Shared by reference across tab histories; frozen so an accidental in-place
// mutation can't corrupt every welcome entry.
export const WELCOME: ViewState = Object.freeze({ type: "welcome" });

export function createInitialState(id: string): TabsState {
    return {
        tabs: [{ id, history: [WELCOME], index: 0 }],
        panes: [id],
        focused: 0,
    };
}

/** True when two panes are displayed side by side. */
export function isSplit(state: TabsState): boolean {
    return state.panes.length === 2;
}

/** The focused pane's tab id (was `state.activeId` before split support). */
export function activeIdOf(state: TabsState): string {
    return state.panes[state.focused];
}

export function getActiveTab(state: TabsState): Tab {
    const id = activeIdOf(state);
    return state.tabs.find((t) => t.id === id) ?? state.tabs[0];
}

export function currentViewOf(tab: Tab): ViewState {
    return tab.history[tab.index];
}

export function sameView(a: ViewState, b: ViewState): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function replaceTab(state: TabsState, id: string, next: Tab): TabsState {
    return { ...state, tabs: state.tabs.map((t) => (t.id === id ? next : t)) };
}

/**
 * Display `id` in the focused pane. If `id` is already shown in the *other*
 * pane, move focus there instead (a tab is never shown in both panes at once).
 */
function showInFocusedPane(state: TabsState, id: string): TabsState {
    const other = state.focused === 0 ? 1 : 0;
    if (isSplit(state) && state.panes[other] === id) {
        return { ...state, focused: other };
    }
    if (state.panes[state.focused] === id) return state;
    const panes = state.panes.slice();
    panes[state.focused] = id;
    return { ...state, panes };
}

export function openInCurrent(state: TabsState, view: ViewState): TabsState {
    const tab = getActiveTab(state);
    if (sameView(currentViewOf(tab), view)) return state;
    const history = [...tab.history.slice(0, tab.index + 1), view];
    return replaceTab(state, tab.id, {
        ...tab,
        history,
        index: history.length - 1,
    });
}

export function openInNew(
    state: TabsState,
    view: ViewState,
    newId: string,
    opts: OpenOptions = {},
): TabsState {
    const tab: Tab = {
        id: newId,
        history: [view],
        index: 0,
        initialFileMode: opts.fileMode,
    };
    const panes = state.panes.slice();
    panes[state.focused] = newId;
    return { ...state, tabs: [...state.tabs, tab], panes };
}

export function newBlankTab(state: TabsState, newId: string): TabsState {
    return openInNew(state, WELCOME, newId);
}

export function activate(state: TabsState, id: string): TabsState {
    if (!state.tabs.some((t) => t.id === id)) return state;
    return showInFocusedPane(state, id);
}

/**
 * Split into two panes: the active tab stays on the left, a second pane opens
 * on the right (focused). The right pane reuses an adjacent open tab, or a new
 * welcome tab when the active tab is the only one open.
 */
export function splitView(state: TabsState, makeId: () => string): TabsState {
    if (isSplit(state)) return state;
    const left = activeIdOf(state);
    if (state.tabs.length >= 2) {
        const i = state.tabs.findIndex((t) => t.id === left);
        const rightIdx = i + 1 < state.tabs.length ? i + 1 : i - 1;
        return { ...state, panes: [left, state.tabs[rightIdx].id], focused: 1 };
    }
    const id = makeId();
    const tab: Tab = { id, history: [WELCOME], index: 0 };
    return {
        ...state,
        tabs: [...state.tabs, tab],
        panes: [left, id],
        focused: 1,
    };
}

/** Move keyboard/click focus to a displayed pane. */
export function focusPane(state: TabsState, paneIndex: number): TabsState {
    if (paneIndex < 0 || paneIndex >= state.panes.length) return state;
    if (state.focused === paneIndex) return state;
    return { ...state, focused: paneIndex };
}

/** Close one pane of a split; the surviving pane's tab fills the view. */
export function closePane(state: TabsState, paneIndex: number): TabsState {
    if (!isSplit(state) || (paneIndex !== 0 && paneIndex !== 1)) return state;
    const keep = state.panes[paneIndex === 0 ? 1 : 0];
    return { ...state, panes: [keep], focused: 0 };
}

/** Pick a tab (not `excludeId`) to fill a pane after its tab was removed. */
function pickReplacement(
    tabs: Tab[],
    removedIdx: number,
    excludeId: string,
): string | null {
    const candidates: string[] = [];
    if (removedIdx < tabs.length) candidates.push(tabs[removedIdx].id);
    if (removedIdx - 1 >= 0) candidates.push(tabs[removedIdx - 1].id);
    for (const t of tabs) candidates.push(t.id);
    return candidates.find((c) => c !== excludeId) ?? null;
}

export function closeTab(
    state: TabsState,
    id: string,
    makeId: () => string,
): TabsState {
    const idx = state.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return state;
    const tabs = state.tabs.filter((t) => t.id !== id);
    if (tabs.length === 0) return createInitialState(makeId());

    const paneIdx = state.panes.indexOf(id);
    if (paneIdx === -1) {
        // A background tab — the displayed panes are untouched.
        return { ...state, tabs };
    }

    if (!isSplit(state)) {
        // Closed the only displayed tab: show its left neighbour.
        return { tabs, panes: [tabs[Math.max(0, idx - 1)].id], focused: 0 };
    }

    // Closed a tab shown in one pane of a split.
    const otherId = state.panes[paneIdx === 0 ? 1 : 0];
    const replacement = pickReplacement(tabs, idx, otherId);
    if (replacement == null) {
        // Not enough distinct tabs to keep both panes → collapse.
        return { tabs, panes: [otherId], focused: 0 };
    }
    const panes = state.panes.slice();
    panes[paneIdx] = replacement;
    return { tabs, panes, focused: state.focused };
}

export function closeOthers(state: TabsState, id: string): TabsState {
    const keep = state.tabs.find((t) => t.id === id);
    if (!keep) return state;
    return { tabs: [keep], panes: [keep.id], focused: 0 };
}

export function closeAll(_state: TabsState, makeId: () => string): TabsState {
    return createInitialState(makeId());
}

export function back(state: TabsState): TabsState {
    const tab = getActiveTab(state);
    if (tab.index <= 0) return state;
    return replaceTab(state, tab.id, { ...tab, index: tab.index - 1 });
}

export function forward(state: TabsState): TabsState {
    const tab = getActiveTab(state);
    if (tab.index >= tab.history.length - 1) return state;
    return replaceTab(state, tab.id, { ...tab, index: tab.index + 1 });
}

export function canGoBack(state: TabsState): boolean {
    return getActiveTab(state).index > 0;
}

export function canGoForward(state: TabsState): boolean {
    const tab = getActiveTab(state);
    return tab.index < tab.history.length - 1;
}

export function nextTab(state: TabsState): TabsState {
    const i = state.tabs.findIndex((t) => t.id === activeIdOf(state));
    return showInFocusedPane(state, state.tabs[(i + 1) % state.tabs.length].id);
}

export function prevTab(state: TabsState): TabsState {
    const len = state.tabs.length;
    const i = state.tabs.findIndex((t) => t.id === activeIdOf(state));
    return showInFocusedPane(state, state.tabs[(i - 1 + len) % len].id);
}

/** idx -1 means "last tab". Out-of-range is a no-op. */
export function jumpToIndex(state: TabsState, idx: number): TabsState {
    const target =
        idx === -1 ? state.tabs[state.tabs.length - 1] : state.tabs[idx];
    return target ? showInFocusedPane(state, target.id) : state;
}

type PathView = Extract<
    ViewState,
    { type: "file" | "image" | "map" | "canvas" | "timeline" }
>;
function isPathView(v: ViewState): v is PathView {
    return (
        v.type === "file" ||
        v.type === "image" ||
        v.type === "map" ||
        v.type === "canvas" ||
        v.type === "timeline"
    );
}

export function applyRename(
    state: TabsState,
    oldPath: string,
    newPath: string,
    newTitle: string,
    kindOf: (path: string) => "file" | "image" | "map" | "canvas" | "timeline",
): TabsState {
    // Rename rewrites EVERY history entry across ALL tabs so back/forward stays
    // valid (cf. applyDelete, which only inspects each tab's current view).
    const tabs = state.tabs.map((tab) => ({
        ...tab,
        history: tab.history.map(
            (v): ViewState =>
                isPathView(v) && v.data?.path === oldPath
                    ? {
                          type: kindOf(newPath),
                          data: { path: newPath, title: newTitle },
                      }
                    : v,
        ),
    }));
    return { ...state, tabs };
}

export function applyDelete(
    state: TabsState,
    path: string,
    makeId: () => string,
): TabsState {
    // Only a tab whose CURRENT view is the deleted file is closed; a stale entry
    // buried in back-history doesn't kill the tab (FileView closes it on demand
    // if you navigate back to a now-missing page).
    const survivors = state.tabs.filter((tab) => {
        const v = currentViewOf(tab);
        return !(isPathView(v) && v.data?.path === path);
    });
    if (survivors.length === 0) return createInitialState(makeId());
    const survivorIds = new Set(survivors.map((t) => t.id));
    let panes = state.panes.filter((id) => survivorIds.has(id));
    if (panes.length === 0) {
        panes = [survivors[survivors.length - 1].id];
    }
    const focused = state.focused < panes.length ? state.focused : 0;
    return { tabs: survivors, panes, focused };
}
