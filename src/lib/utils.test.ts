import { describe, it, expect } from "vitest";
import {
    isCanvas,
    isCanvasFile,
    isTimeline,
    isTimelineFile,
    getDisplayName,
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
