import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./commands", () => ({
    getMapJson: vi.fn(),
    writePageContent: vi.fn().mockResolvedValue(undefined),
    ensureLayerTiles: vi.fn(),
    lookupLayerTileInfo: vi.fn(),
}));

import { getMapJson, writePageContent } from "./commands";
import {
    registerMap,
    updateMapConfig,
    getMapConfig,
    loadMapConfig,
    handleExternalChanges,
} from "./mapStore";
import type { MapConfig } from "./mapModels";

const PATH = "/vault/world.cmap";

function config(): MapConfig {
    return {
        version: "1",
        title: "World",
        width: 100,
        height: 100,
        layers: [],
        pins: [],
        shapes: [],
    };
}

beforeEach(() => {
    vi.mocked(writePageContent).mockClear();
    vi.mocked(getMapJson).mockReset();
});

describe("updateMapConfig", () => {
    it("writes when the update returns a new config", async () => {
        registerMap(PATH, config());
        await updateMapConfig(PATH, (c) => ({ ...c, title: "Renamed" }));
        expect(writePageContent).toHaveBeenCalledTimes(1);
        expect(getMapConfig(PATH)?.title).toBe("Renamed");
    });

    it("skips the write when the update returns the config unchanged", async () => {
        const original = config();
        registerMap(PATH, original);
        await updateMapConfig(PATH, (c) => c);
        expect(writePageContent).not.toHaveBeenCalled();
        expect(getMapConfig(PATH)).toBe(original);
    });
});

describe("handleExternalChanges", () => {
    const OPEN = "/vault/open.cmap";

    it("reloads an open map whose file changed on disk", async () => {
        vi.mocked(getMapJson).mockResolvedValueOnce(JSON.stringify(config()));
        await loadMapConfig(OPEN, true);
        const edited = { ...config(), title: "Edited" };
        vi.mocked(getMapJson).mockResolvedValueOnce(
            JSON.stringify(edited, null, 2),
        );

        await handleExternalChanges([OPEN]);

        expect(getMapConfig(OPEN)?.title).toBe("Edited");
    });

    it("ignores its own save coming back through the watcher", async () => {
        registerMap(PATH, config());
        await updateMapConfig(PATH, (c) => ({ ...c, title: "Saved" }));
        const saved = getMapConfig(PATH);
        const written = vi.mocked(writePageContent).mock.calls[0][1];
        vi.mocked(getMapJson).mockResolvedValueOnce(written);

        await handleExternalChanges([PATH]);

        expect(getMapJson).toHaveBeenCalledTimes(1);
        expect(getMapConfig(PATH)).toBe(saved);
    });

    it("waits for a save in flight before reading the file", async () => {
        let finishWrite = () => {};
        vi.mocked(writePageContent).mockImplementationOnce(
            () => new Promise<void>((done) => (finishWrite = done)),
        );
        registerMap(PATH, config());
        const saving = updateMapConfig(PATH, (c) => ({ ...c, title: "B" }));
        const written = () => vi.mocked(writePageContent).mock.calls[0][1];
        vi.mocked(getMapJson).mockImplementation(async () => written());

        const reloading = handleExternalChanges([PATH]);
        await new Promise((r) => setTimeout(r, 0));
        expect(getMapJson).not.toHaveBeenCalled();

        finishWrite();
        await Promise.all([saving, reloading]);
        expect(getMapJson).toHaveBeenCalledTimes(1);
        expect(getMapConfig(PATH)?.title).toBe("B");
    });

    it("leaves maps that aren't open alone", async () => {
        await handleExternalChanges(["/vault/closed.cmap"]);
        expect(getMapJson).not.toHaveBeenCalled();
    });
});
