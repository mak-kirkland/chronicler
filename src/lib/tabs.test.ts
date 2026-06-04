import { describe, it, expect } from "vitest";
import * as T from "./tabs";
import type { ViewState } from "./tabs";

const file = (path: string, title = path): ViewState => ({
    type: "file",
    data: { path, title },
});
const ids = () => {
    let n = 0;
    return () => `t${n++}`;
};

describe("createInitialState", () => {
    it("starts with one welcome tab that is active", () => {
        const s = T.createInitialState("a");
        expect(s.tabs).toHaveLength(1);
        expect(T.activeIdOf(s)).toBe("a");
        expect(T.isSplit(s)).toBe(false);
        expect(T.currentViewOf(s.tabs[0])).toEqual({ type: "welcome" });
    });
});

describe("openInCurrent", () => {
    it("pushes onto the active tab's history and advances index", () => {
        let s = T.createInitialState("a");
        s = T.openInCurrent(s, file("/p1.md"));
        const tab = T.getActiveTab(s);
        expect(tab.history).toHaveLength(2);
        expect(tab.index).toBe(1);
        expect(T.currentViewOf(tab)).toEqual(file("/p1.md"));
    });

    it("is a no-op when navigating to the identical view", () => {
        let s = T.createInitialState("a");
        s = T.openInCurrent(s, file("/p1.md"));
        const before = s;
        s = T.openInCurrent(s, file("/p1.md"));
        expect(s).toBe(before);
    });

    it("truncates forward history when navigating after going back", () => {
        let s = T.createInitialState("a");
        s = T.openInCurrent(s, file("/p1.md"));
        s = T.openInCurrent(s, file("/p2.md"));
        s = T.back(s); // now at p1
        s = T.openInCurrent(s, file("/p3.md"));
        const tab = T.getActiveTab(s);
        expect(
            tab.history.map((v) => (v.type === "file" ? v.data?.path : v.type)),
        ).toEqual(["welcome", "/p1.md", "/p3.md"]);
        expect(tab.index).toBe(2);
    });
});

describe("openInNew / newBlankTab", () => {
    it("opens a new active tab with its own single-entry history", () => {
        let s = T.createInitialState("a");
        s = T.openInNew(s, file("/p1.md"), "b", { fileMode: "split" });
        expect(s.tabs).toHaveLength(2);
        expect(T.activeIdOf(s)).toBe("b");
        expect(T.getActiveTab(s).initialFileMode).toBe("split");
    });

    it("newBlankTab opens a welcome tab", () => {
        let s = T.createInitialState("a");
        s = T.newBlankTab(s, "b");
        expect(T.currentViewOf(T.getActiveTab(s))).toEqual({ type: "welcome" });
    });
});

describe("activate", () => {
    it("sets the active tab, and is a no-op for an unknown id", () => {
        let s = T.createInitialState("a");
        s = T.openInNew(s, file("/p1.md"), "b"); // active = b
        s = T.activate(s, "a");
        expect(T.activeIdOf(s)).toBe("a");
        const before = s;
        s = T.activate(s, "nope");
        expect(s).toBe(before);
    });
});

describe("closeTab", () => {
    it("activates the left neighbor when closing the active tab", () => {
        const mk = ids();
        let s = T.createInitialState("a");
        s = T.openInNew(s, file("/p1.md"), "b");
        s = T.openInNew(s, file("/p2.md"), "c"); // active = c
        s = T.closeTab(s, "c", mk);
        expect(s.tabs.map((t) => t.id)).toEqual(["a", "b"]);
        expect(T.activeIdOf(s)).toBe("b");
    });

    it("leaves a single fresh welcome tab when the last tab is closed", () => {
        const mk = ids();
        let s = T.createInitialState("a");
        s = T.closeTab(s, "a", mk);
        expect(s.tabs).toHaveLength(1);
        expect(T.currentViewOf(s.tabs[0])).toEqual({ type: "welcome" });
        expect(T.activeIdOf(s)).toBe(s.tabs[0].id);
    });

    it("keeps the active tab when closing a different tab", () => {
        let s = T.createInitialState("a");
        s = T.openInNew(s, file("/p1.md"), "b"); // active = b
        s = T.closeTab(s, "a", ids());
        expect(T.activeIdOf(s)).toBe("b");
    });
});

describe("closeOthers / closeAll", () => {
    it("closeOthers keeps only the given tab", () => {
        let s = T.createInitialState("a");
        s = T.openInNew(s, file("/p1.md"), "b");
        s = T.openInNew(s, file("/p2.md"), "c");
        s = T.closeOthers(s, "b");
        expect(s.tabs.map((t) => t.id)).toEqual(["b"]);
        expect(T.activeIdOf(s)).toBe("b");
    });

    it("closeAll resets to a single welcome tab", () => {
        let s = T.createInitialState("a");
        s = T.openInNew(s, file("/p1.md"), "b");
        s = T.closeAll(s, ids());
        expect(s.tabs).toHaveLength(1);
        expect(T.currentViewOf(s.tabs[0])).toEqual({ type: "welcome" });
    });
});

describe("back / forward / canGo*", () => {
    it("navigates within the active tab only", () => {
        let s = T.createInitialState("a");
        s = T.openInCurrent(s, file("/p1.md"));
        expect(T.canGoBack(s)).toBe(true);
        expect(T.canGoForward(s)).toBe(false);
        s = T.back(s);
        expect(T.currentViewOf(T.getActiveTab(s))).toEqual({ type: "welcome" });
        expect(T.canGoForward(s)).toBe(true);
        s = T.forward(s);
        expect(T.currentViewOf(T.getActiveTab(s))).toEqual(file("/p1.md"));
    });
});

describe("nextTab / prevTab / jumpToIndex", () => {
    it("cycles and jumps", () => {
        let s = T.createInitialState("a");
        s = T.openInNew(s, file("/p1.md"), "b");
        s = T.openInNew(s, file("/p2.md"), "c"); // [a,b,c], active c
        expect(T.activeIdOf(T.nextTab(s))).toBe("a"); // wraps
        expect(T.activeIdOf(T.prevTab(s))).toBe("b");
        expect(T.activeIdOf(T.jumpToIndex(s, 0))).toBe("a");
        expect(T.activeIdOf(T.jumpToIndex(s, -1))).toBe("c"); // -1 = last
    });
});

describe("applyRename / applyDelete", () => {
    it("rewrites matching path views across all tabs", () => {
        let s = T.createInitialState("a");
        s = T.openInNew(s, file("/old.md", "old"), "b");
        s = T.applyRename(s, "/old.md", "/new.md", "new", () => "file");
        const v = T.currentViewOf(s.tabs[1]);
        expect(v).toEqual({
            type: "file",
            data: { path: "/new.md", title: "new" },
        });
    });

    it("closes tabs whose current view points at a deleted path", () => {
        let s = T.createInitialState("a");
        s = T.openInNew(s, file("/p1.md"), "b"); // active b
        s = T.applyDelete(s, "/p1.md", ids());
        expect(s.tabs.map((t) => t.id)).toEqual(["a"]);
        expect(T.activeIdOf(s)).toBe("a");
    });
});

describe("split view", () => {
    // [a(welcome), b(p1), c(p2)] with c active
    const setup3 = () => {
        let s = T.createInitialState("a");
        s = T.openInNew(s, file("/p1.md"), "b");
        s = T.openInNew(s, file("/p2.md"), "c");
        return s;
    };

    it("puts the active tab on the left and focuses a second pane on the right", () => {
        let s = setup3();
        s = T.splitView(s, ids());
        expect(T.isSplit(s)).toBe(true);
        expect(s.panes[0]).toBe("c"); // active tab → left
        expect(s.panes[1]).toBe("b"); // adjacent tab → right (c is last → b)
        expect(s.focused).toBe(1); // right pane focused
        expect(T.activeIdOf(s)).toBe("b");
    });

    it("creates a welcome tab on the right when only one tab is open", () => {
        let s = T.createInitialState("a");
        s = T.splitView(s, () => "w");
        expect(s.tabs.map((t) => t.id)).toEqual(["a", "w"]);
        expect(s.panes).toEqual(["a", "w"]);
        expect(T.currentViewOf(s.tabs[1])).toEqual({ type: "welcome" });
    });

    it("is a no-op when already split", () => {
        let s = setup3();
        s = T.splitView(s, ids());
        const before = s;
        s = T.splitView(s, ids());
        expect(s).toBe(before);
    });

    it("loads a non-displayed tab into the focused pane", () => {
        let s = setup3();
        s = T.splitView(s, ids()); // panes [c, b], focused 1
        s = T.activate(s, "a");
        expect(s.panes).toEqual(["c", "a"]);
        expect(s.focused).toBe(1);
    });

    it("just moves focus when activating the tab shown in the other pane", () => {
        let s = setup3();
        s = T.splitView(s, ids()); // panes [c, b], focused 1
        s = T.activate(s, "c"); // c is in the left pane
        expect(s.panes).toEqual(["c", "b"]); // unchanged
        expect(s.focused).toBe(0);
    });

    it("focusPane sets the focused pane", () => {
        let s = setup3();
        s = T.splitView(s, ids()); // focused 1
        s = T.focusPane(s, 0);
        expect(s.focused).toBe(0);
        expect(T.activeIdOf(s)).toBe("c");
    });

    it("closePane collapses to the surviving pane and clears the split", () => {
        let s = setup3();
        s = T.splitView(s, ids()); // panes [c, b]
        s = T.closePane(s, 1); // close right
        expect(T.isSplit(s)).toBe(false);
        expect(s.panes).toEqual(["c"]);
        expect(T.activeIdOf(s)).toBe("c");
    });

    it("closePane can close the left pane and keep the right", () => {
        let s = setup3();
        s = T.splitView(s, ids()); // panes [c, b]
        s = T.closePane(s, 0);
        expect(s.panes).toEqual(["b"]);
    });

    it("closing a tab shown in a pane replaces it and keeps the split", () => {
        let s = setup3(); // [a, b, c]
        s = T.splitView(s, ids()); // panes [c, b], focused 1
        s = T.closeTab(s, "b", ids());
        expect(T.isSplit(s)).toBe(true);
        expect(s.tabs.map((t) => t.id)).toEqual(["a", "c"]);
        expect(s.panes).toEqual(["c", "a"]);
    });

    it("collapses the split when closing a tab leaves fewer than two", () => {
        let s = T.createInitialState("a");
        s = T.openInNew(s, file("/p1.md"), "b"); // [a, b]
        s = T.splitView(s, ids()); // panes [b, a]
        s = T.closeTab(s, "a", ids());
        expect(T.isSplit(s)).toBe(false);
        expect(s.tabs.map((t) => t.id)).toEqual(["b"]);
        expect(s.panes).toEqual(["b"]);
    });

    it("leaves both panes intact when closing a background tab", () => {
        let s = setup3();
        s = T.splitView(s, ids()); // panes [c, b]; 'a' is background
        s = T.closeTab(s, "a", ids());
        expect(s.panes).toEqual(["c", "b"]);
        expect(T.isSplit(s)).toBe(true);
    });

    it("collapses the split when a file shown in a pane is deleted", () => {
        let s = setup3(); // a=welcome, b=p1, c=p2
        s = T.splitView(s, ids()); // panes [c, b]
        s = T.applyDelete(s, "/p2.md", ids()); // c shows p2
        expect(s.tabs.map((t) => t.id)).toEqual(["a", "b"]);
        expect(s.panes).toEqual(["b"]);
        expect(T.isSplit(s)).toBe(false);
    });
});
