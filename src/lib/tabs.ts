/**
 * @file Pure, framework-free tab-state model. All functions take a TabsState
 * and return a new one (never mutate). The Svelte store wrapper lives in
 * viewStores.ts and supplies id generation.
 */
import type { PageHeader } from "./bindings";

/** Every possible main-view state. A tab's history is a list of these. */
export type ViewState =
    | { type: "welcome" }
    | { type: "tag"; tagName: string }
    | { type: "file"; data: PageHeader | null; sectionId?: string | null }
    | { type: "image"; data: PageHeader | null }
    | { type: "map"; data: PageHeader | null }
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
    activeId: string;
}

export interface OpenOptions {
    fileMode?: FileViewMode;
}

// Shared by reference across tab histories; frozen so an accidental in-place
// mutation can't corrupt every welcome entry.
export const WELCOME: ViewState = Object.freeze({ type: "welcome" });

export function createInitialState(id: string): TabsState {
    return { tabs: [{ id, history: [WELCOME], index: 0 }], activeId: id };
}

export function getActiveTab(state: TabsState): Tab {
    return state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0];
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
    return { tabs: [...state.tabs, tab], activeId: newId };
}

export function newBlankTab(state: TabsState, newId: string): TabsState {
    return openInNew(state, WELCOME, newId);
}

export function activate(state: TabsState, id: string): TabsState {
    if (!state.tabs.some((t) => t.id === id)) return state;
    return { ...state, activeId: id };
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
    let activeId = state.activeId;
    if (state.activeId === id) {
        activeId = tabs[Math.max(0, idx - 1)].id;
    }
    return { tabs, activeId };
}

export function closeOthers(state: TabsState, id: string): TabsState {
    const keep = state.tabs.find((t) => t.id === id);
    if (!keep) return state;
    return { tabs: [keep], activeId: keep.id };
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
    const i = state.tabs.findIndex((t) => t.id === state.activeId);
    const next = state.tabs[(i + 1) % state.tabs.length];
    return { ...state, activeId: next.id };
}

export function prevTab(state: TabsState): TabsState {
    const len = state.tabs.length;
    const i = state.tabs.findIndex((t) => t.id === state.activeId);
    const prev = state.tabs[(i - 1 + len) % len];
    return { ...state, activeId: prev.id };
}

/** idx -1 means "last tab". Out-of-range is a no-op. */
export function jumpToIndex(state: TabsState, idx: number): TabsState {
    const target =
        idx === -1 ? state.tabs[state.tabs.length - 1] : state.tabs[idx];
    return target ? { ...state, activeId: target.id } : state;
}

type PathView = Extract<ViewState, { type: "file" | "image" | "map" }>;
function isPathView(v: ViewState): v is PathView {
    return v.type === "file" || v.type === "image" || v.type === "map";
}

export function applyRename(
    state: TabsState,
    oldPath: string,
    newPath: string,
    newTitle: string,
    kindOf: (path: string) => "file" | "image" | "map",
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
    const activeId = survivors.some((t) => t.id === state.activeId)
        ? state.activeId
        : survivors[survivors.length - 1].id;
    return { tabs: survivors, activeId };
}
