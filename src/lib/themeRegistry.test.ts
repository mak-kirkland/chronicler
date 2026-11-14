import { describe, it, expect } from "vitest";
import { AVAILABLE_FONTS, canonicalFont } from "./themeRegistry";

describe("canonicalFont", () => {
    it("maps a built-in family with a stale fallback to the dropdown's value", () => {
        // Vaults first opened before the default was corrected saved this.
        expect(canonicalFont(`"Cinzel", cursive`)).toBe(`"Cinzel", serif`);
    });

    it("matches the family name regardless of quoting and spacing", () => {
        expect(canonicalFont(`Cinzel,serif`)).toBe(`"Cinzel", serif`);
        expect(canonicalFont(` 'IBM Plex Mono' `)).toBe(
            `"IBM Plex Mono", monospace`,
        );
    });

    it("leaves every dropdown value unchanged", () => {
        for (const font of AVAILABLE_FONTS) {
            expect(canonicalFont(font.value)).toBe(font.value);
        }
    });

    it("leaves fonts it doesn't know (user-added fonts) unchanged", () => {
        expect(canonicalFont(`"My Added Font"`)).toBe(`"My Added Font"`);
    });
});
