import { describe, it, expect } from "vitest";
import {
    applyInfoboxStateToContent,
    createField,
    parseInfoboxContent,
} from "./infobox";

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

describe("applyInfoboxStateToContent — comment preservation", () => {
    const content = `---
# Character sheet
title: Aldric # full name
# --- Stats ---
strength: 10
dex: 12 # rolled
# --- Relations ---
father: "[[Bob]]" # deceased
tags: [hero, knight] # main tags
layout:
  # stat block
  - type: columns
    keys: [strength, dex]
  - type: header # bio section
    text: Bio
---

Body text.
`;

    /** Saves `content` after letting `edit` change the editor state. */
    function save(
        edit: (state: ReturnType<typeof parseInfoboxContent>) => void,
    ) {
        const state = parseInfoboxContent(content);
        edit(state);
        return applyInfoboxStateToContent(content, state);
    }

    const field = (
        state: ReturnType<typeof parseInfoboxContent>,
        key: string,
    ) => state.customFields.find((f) => f.key === key)!;

    it("keeps every comment, the field order and number types when nothing changed", () => {
        const out = save(() => {});

        for (const comment of [
            "# Character sheet",
            "title: Aldric # full name",
            "# --- Stats ---\nstrength: 10\ndex: 12 # rolled",
            '# --- Relations ---\nfather: "[[Bob]]" # deceased',
            "# main tags",
            "# stat block",
            "type: header # bio section",
        ]) {
            expect(out).toContain(comment);
        }
        expect(out.indexOf("strength:")).toBeLessThan(out.indexOf("tags:"));
        expect(out).toContain("\n---\n\nBody text.\n");
    });

    it("keeps a field's comments when its value is edited", () => {
        const out = save((state) => {
            field(state, "father").value = "[[Robert]]";
            state.tags = [...state.tags, "noble"];
            state.layoutRules[1].text = "Biography";
        });

        expect(out).toContain('father: "[[Robert]]" # deceased');
        expect(out).toContain("# --- Relations ---\nfather:");
        expect(out).toMatch(/tags: .*noble.* # main tags/);
        expect(out).toContain(
            "type: header # bio section\n    text: Biography",
        );
    });

    it("moves comments along with reordered fields", () => {
        const out = save((state) => state.customFields.reverse());

        expect(out).toMatch(
            /# --- Relations ---\nfather: .*\ndex: 12 # rolled\n# --- Stats ---\nstrength: 10\ntags:/,
        );
    });

    it("leaves the comment lines above a deleted field in place", () => {
        const out = save((state) => {
            state.customFields = state.customFields.filter(
                (f) => f.key !== "strength",
            );
        });

        expect(out).not.toContain("strength: 10");
        expect(out).toContain("# --- Stats ---\ndex: 12 # rolled");
    });

    it("keeps comments on layout rules that survive a removal", () => {
        const out = save((state) => state.layoutRules.shift());

        expect(out).not.toContain("type: columns");
        expect(out).toContain("type: header # bio section");
    });

    it("adds new fields after the existing ones, in the editor's style", () => {
        const out = save((state) => {
            state.customFields.push({
                ...createField(),
                key: "allies",
                type: "list",
                value: ["Cara", "Dov"],
            });
        });

        expect(out).toContain("# deceased\nallies: [ Cara, Dov ]\ntags:");
    });
});
