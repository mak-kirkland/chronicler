import { describe, expect, it } from "vitest";
import { createEchoGuard } from "./externalRefresh";

describe("createEchoGuard", () => {
    it("treats changes with no expected echo as external", () => {
        const g = createEchoGuard();
        expect(g.isEcho("/v/a.timeline")).toBe(false);
    });

    it("swallows exactly one event per expected echo", () => {
        const g = createEchoGuard();
        g.expectEcho("/v/a.timeline");
        expect(g.isEcho("/v/a.timeline")).toBe(true);
        expect(g.isEcho("/v/a.timeline")).toBe(false);
    });

    it("queues multiple echoes for rapid consecutive writes", () => {
        const g = createEchoGuard();
        g.expectEcho("/v/a.timeline");
        g.expectEcho("/v/a.timeline");
        expect(g.isEcho("/v/a.timeline")).toBe(true);
        expect(g.isEcho("/v/a.timeline")).toBe(true);
        expect(g.isEcho("/v/a.timeline")).toBe(false);
    });

    it("expires stale expectations after the window", () => {
        const g = createEchoGuard(5000);
        g.expectEcho("/v/a.timeline", 1000);
        // 7s later the watcher event can't be our echo anymore.
        expect(g.isEcho("/v/a.timeline", 8000)).toBe(false);
    });

    it("tracks paths independently", () => {
        const g = createEchoGuard();
        g.expectEcho("/v/a.timeline");
        expect(g.isEcho("/v/b.canvas")).toBe(false);
        expect(g.isEcho("/v/a.timeline")).toBe(true);
    });
});
