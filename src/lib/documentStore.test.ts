import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

const writeMock = vi.fn<(path: string, content: string) => Promise<void>>();
const getTimelineJsonMock = vi.fn<(path: string) => Promise<string>>();

vi.mock("$lib/commands", () => ({
    writePageContent: (p: string, c: string) => writeMock(p, c),
    getTimelineJson: (p: string) => getTimelineJsonMock(p),
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

/** In-memory files: writes land here, reads come from here. */
let disk: Map<string, string>;
const text = (v: string) => JSON.stringify({ v }, null, 2);

function makeStore() {
    const readText = vi.fn(async (path: string) => {
        const t = disk.get(path);
        if (t === undefined) throw new Error(`no such file: ${path}`);
        return t;
    });
    const store = createDocumentStore<Doc>({
        noun: "doc",
        context: "docStore",
        maxCached: 4,
        readText,
        parse: (t) => JSON.parse(t) as Doc,
    });
    return { store, readText };
}

const reloads = (store: ReturnType<typeof makeStore>["store"], p: string) =>
    get(store.externalReloads).get(p) ?? 0;

beforeEach(() => {
    disk = new Map();
    writeMock.mockReset();
    getTimelineJsonMock.mockReset();
    writeMock.mockImplementation(async (p, c) => {
        disk.set(p, c);
    });
});

describe("createDocumentStore — external change handling", () => {
    it("ignores our own write coming back through the watcher", async () => {
        const path = "/v/a.doc";
        disk.set(path, text("local"));
        const { store } = makeStore();
        await store.load(path);

        await store.update(path, () => ({ v: "edited" }));
        store.handleExternalChanges([path]); // the watcher echoing our write
        await flush();

        expect(store.fromCache(path)).toEqual({ v: "edited" });
        expect(reloads(store, path)).toBe(0);
    });

    it("reloads an external edit after a burst of coalesced saves", async () => {
        // Regression: each save used to leave an echo token and the watcher
        // coalesced the burst into one event, so the leftover tokens
        // swallowed the next real edit and a later save overwrote it.
        const path = "/v/burst.doc";
        disk.set(path, text("0"));
        const { store } = makeStore();
        await store.load(path);

        for (const v of ["1", "2", "3"])
            await store.update(path, () => ({ v }));
        store.handleExternalChanges([path]); // one event for all three
        await flush();
        expect(reloads(store, path)).toBe(0);

        disk.set(path, text("external"));
        store.handleExternalChanges([path]);
        await flush();

        expect(store.fromCache(path)).toEqual({ v: "external" });
        expect(reloads(store, path)).toBe(1);
    });

    it("judges an event that arrives mid-write once the write has landed", async () => {
        const path = "/v/b.doc";
        disk.set(path, text("local"));
        const { store, readText } = makeStore();
        await store.load(path);

        const write = deferred<void>();
        writeMock.mockImplementationOnce(async (p, c) => {
            await write.promise;
            disk.set(p, c);
        });
        const updating = store.update(path, () => ({ v: "edited" }));

        // Watcher reports a change before our own write has settled. Checking
        // the disk now would see the old text and reload over our edit.
        store.handleExternalChanges([path]);
        await flush();
        expect(readText).toHaveBeenCalledTimes(1); // just the initial load

        write.resolve();
        await updating;
        await flush();
        expect(store.fromCache(path)).toEqual({ v: "edited" });
        expect(reloads(store, path)).toBe(0);
    });

    it("counts a completed external reload so views can drop undo history", async () => {
        const path = "/v/c.doc";
        disk.set(path, text("local"));
        const { store } = makeStore();
        await store.load(path);

        disk.set(path, text("from-disk"));
        store.handleExternalChanges([path]);
        await flush();

        expect(store.fromCache(path)).toEqual({ v: "from-disk" });
        expect(reloads(store, path)).toBe(1);
    });

    it("ignores changes to files that are not open", async () => {
        const { store, readText } = makeStore();

        store.handleExternalChanges(["/v/never-opened.doc"]);
        await flush();

        expect(readText).not.toHaveBeenCalled();
    });

    it("leaves the cache untouched when an external reload fails", async () => {
        const path = "/v/d.doc";
        disk.set(path, text("local"));
        const { store } = makeStore();
        await store.load(path);

        disk.set(path, "{ not json");
        store.handleExternalChanges([path]);
        await flush();
        disk.delete(path);
        store.handleExternalChanges([path]);
        await flush();

        expect(store.fromCache(path)).toEqual({ v: "local" });
        expect(reloads(store, path)).toBe(0);
    });
});

describe("createDocumentStore — write serialization", () => {
    it("runs queued updates against the state the previous one committed", async () => {
        const path = "/v/e.doc";
        const { store } = makeStore();
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
    it("reads through getTimelineJson, parses, then serves from cache", async () => {
        getTimelineJsonMock.mockResolvedValue(
            JSON.stringify({ calendarId: "valdrun", events: [] }),
        );
        const path = "/v/t.timeline";

        const first = await loadTimelineData(path);
        await loadTimelineData(path);

        expect(getTimelineJsonMock).toHaveBeenCalledTimes(1);
        expect(first?.calendarId).toBe("valdrun");
        expect(getTimelineFromCache(path)).toBe(first);
    });
});
