/**
 * @file Region shape actions (merge / cut / fill / split) as MapView's menu
 * and merge pick mode call them: run the pure op from `mapRegionOps` against
 * the latest config inside `updateMapConfig`, and tell the user when it
 * didn't happen.
 *
 * Kept apart from `mapActions.ts` (which opens Svelte modals) so it can be
 * unit-tested under vitest's node environment.
 */

import { updateMapConfig } from "$lib/mapStore";
import { translate } from "$lib/i18n";
import { log } from "$lib/logger";
import { uuid } from "$lib/utils";
import type { MapConfig, MapPoint } from "$lib/mapModels";
import {
    cutHole,
    cutRegionOut,
    fillHole,
    mergeRegions,
    splitRegion,
    type RegionOpResult,
} from "$lib/mapRegionOps";

type RefusalReason = Extract<RegionOpResult, { ok: false }>["reason"];

/**
 * Runs a region shape operation against the latest config inside the
 * serialized update queue. A refused operation leaves the file untouched
 * (`updateMapConfig` skips the write when handed back the same config); the
 * one refusal worth explaining — "that would delete the whole region" — is
 * told to the user. A geometry error and a failed save get different
 * messages: only the first is about the shape.
 */
export async function runRegionOp(
    mapPath: string,
    regionId: string,
    op: (config: MapConfig) => RegionOpResult,
): Promise<void> {
    // Assigned inside the update callback; the `as` keeps TS from narrowing
    // them to their initial values across the await.
    let refusedReason = null as RefusalReason | null;
    let geometryFailed = false as boolean;
    let regionName = "";
    try {
        await updateMapConfig(mapPath, (config) => {
            let result: RegionOpResult;
            try {
                result = op(config);
            } catch (e) {
                geometryFailed = true;
                throw e;
            }
            if (result.ok) return result.config;
            refusedReason = result.reason;
            regionName =
                config.shapes.find((s) => s.id === regionId)?.label ||
                translate("map.unnamed");
            return config;
        });
    } catch (e) {
        log.error(
            geometryFailed
                ? "Region shape operation failed"
                : "Saving a region shape change failed",
            e,
            "mapRegionActions",
        );
        alert(
            translate(
                geometryFailed
                    ? "map.regionShapeFailed"
                    : "map.regionSaveFailed",
            ),
        );
        return;
    }
    if (refusedReason === "wouldRemoveAll") {
        alert(translate("map.cutWouldRemoveRegion", { name: regionName }));
    } else if (refusedReason === "notFound") {
        // Deleted or changed elsewhere (another pane, an external edit)
        // between choosing the action and running it.
        alert(translate("map.regionGone"));
    }
}

/** Cut a drawn outline out of a region; the outline itself is not kept. */
export function cutHoleInRegion(
    mapPath: string,
    regionId: string,
    drawn: MapPoint[],
): Promise<void> {
    return runRegionOp(mapPath, regionId, (c) => cutHole(c, regionId, drawn));
}

/** Cut one region's shape out of another; the cutter stays a region. */
export function cutRegionOutOf(
    mapPath: string,
    targetId: string,
    cutterId: string,
): Promise<void> {
    return runRegionOp(mapPath, targetId, (c) =>
        cutRegionOut(c, targetId, cutterId),
    );
}

/** Remove the hole of `regionId` that contains `at`. */
export function fillRegionHole(
    mapPath: string,
    regionId: string,
    at: MapPoint,
): Promise<void> {
    return runRegionOp(mapPath, regionId, (c) => fillHole(c, regionId, at));
}

/** Turn each piece of a multi-piece region back into its own region. */
export function splitRegionApart(
    mapPath: string,
    regionId: string,
): Promise<void> {
    return runRegionOp(mapPath, regionId, (c) =>
        splitRegion(c, regionId, uuid),
    );
}

/** Fold `otherIds` into `targetId` (union) and delete them. */
export function mergeRegionsInto(
    mapPath: string,
    targetId: string,
    otherIds: string[],
): Promise<void> {
    return runRegionOp(mapPath, targetId, (c) =>
        mergeRegions(c, targetId, otherIds),
    );
}
