import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./commands", () => ({
    getMapConfig: vi.fn(),
    writePageContent: vi.fn().mockResolvedValue(undefined),
    ensureLayerTiles: vi.fn(),
    lookupLayerTileInfo: vi.fn(),
}));

import { writePageContent } from "./commands";
import { registerMap, updateMapConfig, getMapConfig } from "./mapStore";
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
