import { describe, it, expect } from "vitest";
import { applyMapNameCompletion, mapLinkQuery } from "./mapLinkAutocomplete";

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

    it("recognises a map link whose alias is being typed, so nothing is offered", () => {
        expect(mapLinkQuery("map:Eldoria|x")).toEqual({ kind: "alias" });
        expect(mapLinkQuery("map:Eldoria#Castle|the")).toEqual({
            kind: "alias",
        });
    });
});

describe("applyMapNameCompletion", () => {
    it("fills in the name and leaves the link open", () => {
        expect(
            applyMapNameCompletion("see [[map:Eld", 13, 10, "Eldoria"),
        ).toEqual({
            text: "see [[map:Eldoria",
            caret: 17,
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
