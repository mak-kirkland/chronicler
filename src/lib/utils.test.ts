import { describe, it, expect } from "vitest";
import {
    isCanvas,
    isCanvasFile,
    isTimeline,
    isTimelineFile,
    getDisplayName,
    parentFolderName,
    vaultDisplayName,
} from "./utils";
import type { FileNode } from "./bindings";

const fnode = (name: string, file_type: FileNode["file_type"]): FileNode =>
    ({ name, path: `/v/${name}`, file_type }) as FileNode;

describe("canvas helpers", () => {
    it("isCanvas matches the Canvas file_type", () => {
        expect(isCanvas(fnode("a.canvas", "Canvas"))).toBe(true);
        expect(isCanvas(fnode("a.md", "Markdown"))).toBe(false);
    });
    it("isCanvasFile matches the extension", () => {
        expect(isCanvasFile("/v/Ideas.canvas")).toBe(true);
        expect(isCanvasFile("/v/world.cmap")).toBe(false);
    });
    it("getDisplayName strips the .canvas extension", () => {
        expect(getDisplayName(fnode("Ideas.canvas", "Canvas"))).toBe("Ideas");
    });
});

describe("isTimelineFile", () => {
    it("recognises .timeline case-insensitively", () => {
        expect(isTimelineFile("/v/History.timeline")).toBe(true);
        expect(isTimelineFile("/v/History.TIMELINE")).toBe(true);
    });
    it("rejects other extensions", () => {
        expect(isTimelineFile("/v/History.md")).toBe(false);
        expect(isTimelineFile("/v/timeline")).toBe(false);
    });
});

describe("parentFolderName", () => {
    it("names the immediate parent folder", () => {
        expect(parentFolderName("/v/Places/Cantathaer.md", "/v")).toBe(
            "Places",
        );
    });
    it("returns nothing for files at the vault root", () => {
        expect(parentFolderName("/v/Index.md", "/v")).toBe("");
    });
    it("names only the immediate parent, not the whole chain", () => {
        expect(parentFolderName("/v/Places/Cities/Cantathaer.md", "/v")).toBe(
            "Cities",
        );
    });
    it("handles Windows separators", () => {
        expect(
            parentFolderName("C:\\vault\\Places\\Cantathaer.md", "C:\\vault"),
        ).toBe("Places");
        expect(parentFolderName("C:\\vault\\Index.md", "C:\\vault")).toBe("");
    });
    it("falls back to the raw parent when the vault path is unknown", () => {
        expect(parentFolderName("/v/Places/Cantathaer.md", null)).toBe(
            "Places",
        );
    });
    it("tolerates trailing slashes on the vault path", () => {
        expect(parentFolderName("/v/Index.md", "/v/")).toBe("");
    });
});

describe("vaultDisplayName", () => {
    it("names the vault by its folder", () => {
        expect(vaultDisplayName("/home/me/Documents/Aetheria")).toBe(
            "Aetheria",
        );
    });
    it("tolerates a trailing separator", () => {
        expect(vaultDisplayName("/home/me/Documents/Aetheria/")).toBe(
            "Aetheria",
        );
    });
    it("handles Windows separators", () => {
        expect(vaultDisplayName("C:\\Users\\me\\Aetheria")).toBe("Aetheria");
    });
    it("falls back to the raw path when there are no segments", () => {
        expect(vaultDisplayName("/")).toBe("/");
    });
});

describe("timeline helpers", () => {
    it("isTimeline matches the Timeline file_type", () => {
        expect(isTimeline(fnode("a.timeline", "Timeline"))).toBe(true);
        expect(isTimeline(fnode("a.md", "Markdown"))).toBe(false);
    });
    it("getDisplayName strips the .timeline extension", () => {
        expect(getDisplayName(fnode("History.timeline", "Timeline"))).toBe(
            "History",
        );
    });
});
