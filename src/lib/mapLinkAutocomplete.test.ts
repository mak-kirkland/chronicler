import { describe, it, expect } from "vitest";
import {
    applyMapNameCompletion,
    isMapLinkTarget,
    mapLinkName,
    mapLinkQuery,
} from "./mapLinkAutocomplete";

describe("mapLinkName", () => {
    it("reads the map name the way the backend does", () => {
        expect(mapLinkName("map:Eldoria")).toBe("Eldoria");
        expect(mapLinkName(" Map: Eldoria ")).toBe("Eldoria");
        expect(mapLinkName("Eldoria")).toBeNull();
        expect(mapLinkName("map: ")).toBeNull();
    });

    it("still counts a nameless map link as a map link", () => {
        expect(isMapLinkTarget("map:")).toBe(true);
        expect(isMapLinkTarget(" MAP:x")).toBe(true);
        expect(isMapLinkTarget("mapx")).toBe(false);
    });
});

describe("mapLinkQuery", () => {
    it("reads a map name being typed", () => {
        expect(mapLinkQuery("map:Eld")).toEqual({
            kind: "map",
            name: "Eld",
            nameStart: 4,
        });
    });

    it("reads a place being typed, any prefix case", () => {
        expect(mapLinkQuery("Map:Eldoria#Cas")).toEqual({
            kind: "place",
            map: "Eldoria",
            place: "Cas",
            placeStart: 12,
        });
    });

    it("ignores page links", () => {
        expect(mapLinkQuery("Eldoria")).toBeNull();
    });

    it("allows spaces before the prefix, the name and the place, as links do", () => {
        expect(mapLinkQuery(" map:Eld")).toEqual({
            kind: "map",
            name: "Eld",
            nameStart: 5,
        });
        // The part to complete starts at its first letter, so an editor
        // filtering on the text from there matches "Eld", not " Eld".
        expect(mapLinkQuery("map:  Eld")).toEqual({
            kind: "map",
            name: "Eld",
            nameStart: 6,
        });
        expect(mapLinkQuery("map:Eldoria# Cas")).toEqual({
            kind: "place",
            map: "Eldoria",
            place: "Cas",
            placeStart: 13,
        });
        expect(mapLinkQuery("  map:Eldoria|x")).toEqual({ kind: "alias" });
    });

    it("recognises a map link whose alias is being typed, so nothing is offered", () => {
        expect(mapLinkQuery("map:Eldoria|x")).toEqual({ kind: "alias" });
        expect(mapLinkQuery("map:Eldoria#Castle|the")).toEqual({
            kind: "alias",
        });
    });
});

describe("applyMapNameCompletion", () => {
    it("closes an unclosed link, with the caret still after the name", () => {
        expect(
            applyMapNameCompletion("see [[map:Eld", 13, 10, "Eldoria"),
        ).toEqual({
            text: "see [[map:Eldoria]]",
            caret: 17,
        });
    });

    it("leaves the text after an unclosed link alone", () => {
        expect(
            applyMapNameCompletion("[[map:Eld and on", 9, 6, "Eldoria"),
        ).toEqual({
            text: "[[map:Eldoria]] and on",
            caret: 13,
        });
        // The ]] belongs to the next link, not this one.
        expect(
            applyMapNameCompletion("[[map:Eld and [[Other]]", 9, 6, "Eldoria"),
        ).toEqual({
            text: "[[map:Eldoria]] and [[Other]]",
            caret: 13,
        });
    });

    it("doesn't add brackets to a link that's already closed", () => {
        expect(
            applyMapNameCompletion("[[map:Eld]] on", 9, 6, "Eldoria"),
        ).toEqual({
            text: "[[map:Eldoria]] on",
            caret: 13,
        });
    });

    it("replaces the rest of the name after the caret, up to the place", () => {
        expect(
            applyMapNameCompletion("[[map:Eldxx#P]]", 9, 6, "Eldoria"),
        ).toEqual({
            text: "[[map:Eldoria#P]]",
            caret: 13,
        });
    });
});
