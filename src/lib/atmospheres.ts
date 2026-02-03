/**
 * @file Defines the Atmosphere Packs available in the application.
 * An Atmosphere Pack is a "Total Conversion" product that bundles
 * visual assets (Icons, Textures, Sounds) under a unified identity.
 */

import { coreIcons, fantasyIcons, type IconPack } from "./icons";

export interface AtmospherePack {
    id: string;
    name: string;
    description: string;
    iconSet: IconPack;
}

export const coreAtmosphere: AtmospherePack = {
    id: "core",
    name: "Standard",
    description: "Clean, modern SVG icons with accent color theming.",
    iconSet: coreIcons,
};

export const fantasyAtmosphere: AtmospherePack = {
    id: "fantasy-pack",
    name: "High Fantasy",
    description: "Parchment, wax seals, and ancient chests.",
    iconSet: fantasyIcons,
};

// The registry used by the Modal to display products
export const atmospheres: Record<string, AtmospherePack> = {
    core: coreAtmosphere,
    "fantasy-pack": fantasyAtmosphere,
};
