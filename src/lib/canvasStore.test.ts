import { describe, it, expect, vi, beforeEach } from "vitest";

const writeMock = vi.fn<(path: string, content: string) => Promise<void>>();
const getMock = vi.fn<(path: string) => Promise<unknown>>();

vi.mock("$lib/commands", () => ({
    writePageContent: (p: string, c: string) => writeMock(p, c),
    getCanvasData: (p: string) => getMock(p),
}));

// `$lib/logger` may pull in Tauri plugins; stub it for the node test env.
vi.mock("$lib/logger", () => ({
    log: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));

import {
    loadCanvasData,
    registerCanvas,
    getCanvasFromCache,
    updateCanvas,
} from "./canvasStore";
import { emptyCanvas } from "./canvasModels";
import type { CanvasData, CanvasTextNode } from "./canvasModels";

const node = (id: string): CanvasTextNode => ({
    id,
    type: "text",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    text: id,
});

beforeEach(() => {
    writeMock.mockReset();
    getMock.mockReset();
    writeMock.mockResolvedValue(undefined);
});

describe("canvasStore", () => {
    it("loadCanvasData fetches once then serves from cache", async () => {
        getMock.mockResolvedValue(emptyCanvas());
        const p = "/v/a.canvas";
        await loadCanvasData(p);
        await loadCanvasData(p);
        expect(getMock).toHaveBeenCalledTimes(1);
    });

    it("updateCanvas applies optimistically and writes JSON to disk", async () => {
        const p = "/v/b.canvas";
        registerCanvas(p, emptyCanvas());
        await updateCanvas(p, (d) => ({ ...d, nodes: [node("x")] }));
        expect(getCanvasFromCache(p)?.nodes).toHaveLength(1);
        expect(writeMock).toHaveBeenCalledTimes(1);
        const written = JSON.parse(writeMock.mock.calls[0][1]) as CanvasData;
        expect(written.nodes[0].id).toBe("x");
    });

    it("rolls back the cache when the disk write fails", async () => {
        const p = "/v/c.canvas";
        registerCanvas(p, emptyCanvas());
        writeMock.mockRejectedValueOnce(new Error("disk full"));
        await expect(
            updateCanvas(p, (d) => ({ ...d, nodes: [node("y")] })),
        ).rejects.toThrow("disk full");
        expect(getCanvasFromCache(p)?.nodes).toHaveLength(0);
    });
});
