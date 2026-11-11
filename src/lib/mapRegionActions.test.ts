import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./commands", () => ({
    getMapConfig: vi.fn(),
    writePageContent: vi.fn().mockResolvedValue(undefined),
    ensureLayerTiles: vi.fn(),
    lookupLayerTileInfo: vi.fn(),
}));

import { writePageContent } from "./commands";
import { registerMap } from "./mapStore";
import { translate } from "./i18n";
import type { MapConfig, MapPoint } from "./mapModels";
import { runRegionOp, cutRegionOutOf } from "./mapRegionActions";

const PATH = "/vault/actions.cmap";
const rect = (x0: number, y0: number, x1: number, y1: number): MapPoint[] => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
];

function config(): MapConfig {
    return {
        version: "1",
        title: "W",
        width: 200,
        height: 200,
        layers: [],
        pins: [],
        shapes: [
            {
                id: "italy",
                type: "polygon",
                label: "Italy",
                points: rect(0, 0, 100, 100),
            },
            {
                id: "vatican",
                type: "polygon",
                label: "Vatican",
                points: rect(40, 40, 60, 60),
            },
        ],
    };
}

const alertSpy = vi.fn();

beforeEach(() => {
    vi.stubGlobal("alert", alertSpy);
    alertSpy.mockClear();
    vi.mocked(writePageContent).mockReset().mockResolvedValue(undefined);
    registerMap(PATH, config());
});

describe("region actions tell the user the right thing", () => {
    it("blames the shape when the geometry fails", async () => {
        await runRegionOp(PATH, "italy", () => {
            throw new Error("Unable to complete output ring");
        });
        expect(alertSpy).toHaveBeenCalledWith(
            translate("map.regionShapeFailed"),
        );
    });

    it("reports a failed save as a save failure, not a shape problem", async () => {
        vi.mocked(writePageContent).mockRejectedValue(new Error("disk full"));
        await cutRegionOutOf(PATH, "italy", "vatican");
        expect(alertSpy).toHaveBeenCalledTimes(1);
        expect(alertSpy).toHaveBeenCalledWith(
            translate("map.regionSaveFailed"),
        );
    });

    it("explains a cut that would remove the whole region", async () => {
        await cutRegionOutOf(PATH, "vatican", "italy");
        expect(alertSpy).toHaveBeenCalledWith(
            translate("map.cutWouldRemoveRegion", { name: "Vatican" }),
        );
        expect(writePageContent).not.toHaveBeenCalled();
    });

    it("says so when a region vanished before the action ran", async () => {
        await cutRegionOutOf(PATH, "italy", "deleted-meanwhile");
        expect(alertSpy).toHaveBeenCalledWith(translate("map.regionGone"));
        expect(writePageContent).not.toHaveBeenCalled();
    });

    it("saves quietly when the operation works", async () => {
        await cutRegionOutOf(PATH, "italy", "vatican");
        expect(alertSpy).not.toHaveBeenCalled();
        expect(writePageContent).toHaveBeenCalledTimes(1);
    });
});
