/**
 * @file Defines the Atmosphere Packs available in the application.
 * An Atmosphere Pack is a "Total Conversion" product that bundles
 * visual assets (Icons, Textures, Sounds) under a unified identity.
 */

import { coreIcons, fantasyIcons, type IconPack } from "./icons";

export interface AtmospherePack {
    id: string;
    /** i18n key of the pack's display name (translate with `$t`). */
    name: string;
    /** i18n key of the pack's one-line description (translate with `$t`). */
    description: string;
    iconSet: IconPack;
}

export const coreAtmosphere: AtmospherePack = {
    id: "core",
    name: "atmosphere.pack.core.name",
    description: "atmosphere.pack.core.description",
    iconSet: coreIcons,
};

export const fantasyAtmosphere: AtmospherePack = {
    id: "fantasy-pack",
    name: "atmosphere.pack.fantasy.name",
    description: "atmosphere.pack.fantasy.description",
    iconSet: fantasyIcons,
};

// The registry used by the Modal to display products
export const atmospheres: Record<string, AtmospherePack> = {
    core: coreAtmosphere,
    "fantasy-pack": fantasyAtmosphere,
};
