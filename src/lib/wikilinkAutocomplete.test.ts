import { describe, expect, it } from "vitest";
import {
    applyWikilinkCompletion,
    wikilinkQueryAt,
} from "./wikilinkAutocomplete";

describe("wikilinkQueryAt", () => {
    it("returns null with no open wikilink", () => {
        expect(wikilinkQueryAt("plain text", 5)).toBeNull();
    });

    it("finds the open token before the caret", () => {
        const text = "see [[Bat";
        expect(wikilinkQueryAt(text, text.length)).toEqual({
            start: 6,
            query: "Bat",
        });
    });

    it("returns an empty query right after the brackets", () => {
        expect(wikilinkQueryAt("[[", 2)).toEqual({ start: 2, query: "" });
    });

    it("ignores closed links and stops at newlines", () => {
        const closed = "see [[Battle]] more";
        expect(wikilinkQueryAt(closed, closed.length)).toBeNull();
        const newline = "see [[Bat\ntle";
        expect(wikilinkQueryAt(newline, newline.length)).toBeNull();
    });

    it("only considers text before the caret", () => {
        const text = "see [[Bat]] end";
        // Caret inside the link, before the closing brackets.
        expect(wikilinkQueryAt(text, 9)).toEqual({ start: 6, query: "Bat" });
    });
});

describe("applyWikilinkCompletion", () => {
    it("completes the title and closes the brackets", () => {
        const text = "see [[Bat and more";
        const r = applyWikilinkCompletion(text, 9, 6, "Battle of Redford");
        expect(r.text).toBe("see [[Battle of Redford]] and more");
        expect(r.caret).toBe(25); // just past the ]]
    });

    it("does not double-close when brackets already follow the caret", () => {
        const text = "see [[Bat]] end";
        const r = applyWikilinkCompletion(text, 9, 6, "Battle");
        expect(r.text).toBe("see [[Battle]] end");
        expect(r.caret).toBe(14);
    });

    it("consumes the token tail through its closing brackets when the caret is mid-query", () => {
        const text = "see [[Bat]] end";
        const r = applyWikilinkCompletion(text, 7, 6, "Battle");
        expect(r.text).toBe("see [[Battle]] end");
        expect(r.caret).toBe(14);
    });

    it("preserves text after the caret when the next delimiter is not a closer", () => {
        const text = "see [[Bat and [[Other]] x";
        const r = applyWikilinkCompletion(text, 7, 6, "Battle");
        expect(r.text).toBe("see [[Battle]]at and [[Other]] x");
        expect(r.caret).toBe(14);
    });
});
