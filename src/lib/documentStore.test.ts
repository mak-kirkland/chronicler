import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

const writeMock = vi.fn<(path: string, content: string) => Promise<void>>();
const getTimelineMock = vi.fn<(path: string) => Promise<unknown>>();

vi.mock("$lib/commands", () => ({
    writePageContent: (p: string, c: string) => writeMock(p, c),
    getTimelineData: (p: string) => getTimelineMock(p),
}));

// `$lib/logger` may pull in Tauri plugins; stub it for the node test env.
vi.mock("$lib/logger", () => ({
    log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));

import { createDocumentStore } from "./documentStore";
import { loadTimelineData, getTimelineFromCache } from "./timelineStore";

interface Doc {
    v: string;
}

/** Lets a test hold a disk write open across other events. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

/** Drain the microtask queue so chained reload tasks have run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

function makeStore(read: (path: string) => Promise<Doc>) {
    return createDocumentStore<Doc>({
        noun: "doc",
        context: "docStore",
        maxCached: 4,
        read,
    });
}

beforeEach(() => {
    writeMock.mockReset();
    getTimelineMock.mockReset();
    writeMock.mockResolvedValue(undefined);
});

describe("createDocumentStore — external change handling", () => {
    it("swallows the echo of our own write without reloading", async () => {
        const path = "/v/a.doc";
        const read = vi.fn<(p: string) => Promise<Doc>>();
        const store = makeStore(read);
        store.register(path, { v: "local" });

        await store.update(path, () => ({ v: "edited" }));
        store.handleExternalChanges([path]); // the watcher echoing our own write
        await flush();

        expect(read).not.toHaveBeenCalled();
        expect(store.fromCache(path)).toEqual({ v: "edited" });
        expect(get(store.externalReloads).get(path) ?? 0).toBe(0);
    });

    it("reloads on an external change that arrives while a write is in flight", async () => {
        // Regression: this event used to be dropped outright, leaving the cache
        // stale so the next local edit would overwrite the real change on disk.
        const path = "/v/b.doc";
        const read = vi.fn<(p: string) => Promise<Doc>>().mockResolvedValue({
            v: "from-disk",
        });
        const store = makeStore(read);
        store.register(path, { v: "local" });

        const write = deferred<void>();
        writeMock.mockReturnValueOnce(write.promise);
        const updating = store.update(path, () => ({ v: "edited" }));

        // Watcher reports a change before our own write has settled.
        store.handleExternalChanges([path]);

        write.resolve();
        await updating;

        // Our write's own echo lands next. One of the two events is the echo,
        // the other is real, so exactly one reload must survive.
        store.handleExternalChanges([path]);
        await flush();

        expect(read).toHaveBeenCalledTimes(1);
        expect(read).toHaveBeenCalledWith(path);
        expect(store.fromCache(path)).toEqual({ v: "from-disk" });
    });

    it("counts a completed external reload so views can drop undo history", async () => {
        const path = "/v/c.doc";
        const read = vi.fn<(p: string) => Promise<Doc>>().mockResolvedValue({
            v: "from-disk",
        });
        const store = makeStore(read);
        store.register(path, { v: "local" });

        store.handleExternalChanges([path]);
        await flush();

        expect(get(store.externalReloads).get(path)).toBe(1);
    });

    it("ignores changes to files that are not open", async () => {
        const read = vi.fn<(p: string) => Promise<Doc>>();
        const store = makeStore(read);

        store.handleExternalChanges(["/v/never-opened.doc"]);
        await flush();

        expect(read).not.toHaveBeenCalled();
    });

    it("leaves the cache untouched when an external reload fails", async () => {
        const path = "/v/d.doc";
        const read = vi
            .fn<(p: string) => Promise<Doc>>()
            .mockRejectedValue(new Error("unreadable"));
        const store = makeStore(read);
        store.register(path, { v: "local" });

        store.handleExternalChanges([path]);
        await flush();

        expect(store.fromCache(path)).toEqual({ v: "local" });
        expect(get(store.externalReloads).get(path) ?? 0).toBe(0);
    });
});

describe("createDocumentStore — write serialization", () => {
    it("runs queued updates against the state the previous one committed", async () => {
        const path = "/v/e.doc";
        const read = vi.fn<(p: string) => Promise<Doc>>();
        const store = makeStore(read);
        store.register(path, { v: "a" });

        const write = deferred<void>();
        writeMock.mockReturnValueOnce(write.promise);

        const seen: string[] = [];
        const first = store.update(path, (d) => {
            seen.push(d.v);
            return { v: d.v + "b" };
        });
        // Enqueued while the first write is still open.
        const second = store.update(path, (d) => {
            seen.push(d.v);
            return { v: d.v + "c" };
        });

        write.resolve();
        await Promise.all([first, second]);

        expect(seen).toEqual(["a", "ab"]);
        expect(store.fromCache(path)).toEqual({ v: "abc" });
    });
});

describe("timelineStore binding", () => {
    it("reads through getTimelineData and then serves from cache", async () => {
        const data = { events: [] };
        getTimelineMock.mockResolvedValue(data);
        const path = "/v/t.timeline";

        const first = await loadTimelineData(path);
        await loadTimelineData(path);

        expect(getTimelineMock).toHaveBeenCalledTimes(1);
        expect(first).toEqual(data);
        expect(getTimelineFromCache(path)).toEqual(data);
    });
});
