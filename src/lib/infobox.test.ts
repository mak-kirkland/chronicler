import { describe, it, expect } from "vitest";
import { parseInfoboxContent } from "./infobox";

describe("parseInfoboxContent — frontmatter detection", () => {
    it("parses well-formed frontmatter and ignores a table in the body", () => {
        const content = `---
title: Hero
tags: [a, b]
---

# Notes

| Name | Value |
| --- | --- |
| HP | 100 |
`;
        const state = parseInfoboxContent(content);

        expect(state.title).toBe("Hero");
        expect(state.tags).toEqual(["a", "b"]);
        // The body's markdown table must NOT leak into custom fields.
        expect(state.customFields).toEqual([]);
    });

    it("treats a page with no frontmatter as empty (does not parse the body)", () => {
        const content = `# Shopping list

Just some prose here.
`;
        const state = parseInfoboxContent(content);

        expect(state.title).toBe("");
        expect(state.subtitle).toBe("");
        expect(state.tags).toEqual([]);
        expect(state.customFields).toEqual([]);
        expect(state.images).toEqual([]);
        expect(state.layoutRules).toEqual([]);
    });

    it("does not load a markdown table as fields when there is no frontmatter", () => {
        const content = `# Character

| Name | Value |
| --- | --- |
| HP | 100 |
| MP | 50 |
`;
        const state = parseInfoboxContent(content);

        // The "---" inside the table separator must not be mistaken for a
        // frontmatter delimiter, and the table must not become custom fields.
        expect(state.customFields).toEqual([]);
    });

    it("does not mistake a markdown table separator for a closing delimiter", () => {
        // File begins with `---` (a thematic break, not frontmatter). The first
        // following `\n---` is a pipe-less GFM table separator row. The old code
        // captured the body between them and exploded it into per-character fields.
        const content = `---

intro paragraph

Name | Value
--- | ---
HP | 100
`;
        const state = parseInfoboxContent(content);

        expect(state.customFields).toEqual([]);
        expect(state.title).toBe("");
    });
});
