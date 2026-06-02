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
        expect(s.activeId).toBe("a");
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
        expect(s.activeId).toBe("b");
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
        expect(s.activeId).toBe("a");
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
        expect(s.activeId).toBe("b");
    });

    it("leaves a single fresh welcome tab when the last tab is closed", () => {
        const mk = ids();
        let s = T.createInitialState("a");
        s = T.closeTab(s, "a", mk);
        expect(s.tabs).toHaveLength(1);
        expect(T.currentViewOf(s.tabs[0])).toEqual({ type: "welcome" });
        expect(s.activeId).toBe(s.tabs[0].id);
    });

    it("keeps the active tab when closing a different tab", () => {
        let s = T.createInitialState("a");
        s = T.openInNew(s, file("/p1.md"), "b"); // active = b
        s = T.closeTab(s, "a", ids());
        expect(s.activeId).toBe("b");
    });
});

describe("closeOthers / closeAll", () => {
    it("closeOthers keeps only the given tab", () => {
        let s = T.createInitialState("a");
        s = T.openInNew(s, file("/p1.md"), "b");
        s = T.openInNew(s, file("/p2.md"), "c");
        s = T.closeOthers(s, "b");
        expect(s.tabs.map((t) => t.id)).toEqual(["b"]);
        expect(s.activeId).toBe("b");
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
        expect(T.nextTab(s).activeId).toBe("a"); // wraps
        expect(T.prevTab(s).activeId).toBe("b");
        expect(T.jumpToIndex(s, 0).activeId).toBe("a");
        expect(T.jumpToIndex(s, -1).activeId).toBe("c"); // -1 = last
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
        expect(s.activeId).toBe("a");
    });
});
