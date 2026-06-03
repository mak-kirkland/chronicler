import { describe, it, expect } from "vitest";
import {
    eventToCombo,
    isModifierOnly,
    formatCombo,
    comboToCodeMirror,
} from "./keybindingUtils";

/** Minimal stand-in for the bits of KeyboardEvent the helpers read. */
const ev = (
    key: string,
    mods: Partial<{
        ctrlKey: boolean;
        altKey: boolean;
        metaKey: boolean;
        shiftKey: boolean;
    }> = {},
) => ({
    key,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
});

describe("eventToCombo", () => {
    it("emits modifiers in a fixed Control+Alt+Meta+Shift order", () => {
        expect(
            eventToCombo(
                ev("a", {
                    shiftKey: true,
                    metaKey: true,
                    altKey: true,
                    ctrlKey: true,
                }),
            ),
        ).toBe("Control+Alt+Meta+Shift+a");
    });

    it("lowercases single-letter keys so Shift state lives only in the flag", () => {
        expect(eventToCombo(ev("B", { shiftKey: true }))).toBe("Shift+b");
        expect(eventToCombo(ev("t", { ctrlKey: true }))).toBe("Control+t");
    });

    it("leaves named keys untouched", () => {
        expect(eventToCombo(ev("ArrowLeft", { altKey: true }))).toBe(
            "Alt+ArrowLeft",
        );
        expect(eventToCombo(ev("Tab", { ctrlKey: true, shiftKey: true }))).toBe(
            "Control+Shift+Tab",
        );
    });

    it("keeps punctuation keys verbatim", () => {
        expect(eventToCombo(ev("[", { metaKey: true }))).toBe("Meta+[");
    });
});

describe("isModifierOnly", () => {
    it("is true when only a modifier key is held", () => {
        expect(isModifierOnly(ev("Control"))).toBe(true);
        expect(isModifierOnly(ev("Shift"))).toBe(true);
        expect(isModifierOnly(ev("Alt"))).toBe(true);
        expect(isModifierOnly(ev("Meta"))).toBe(true);
    });

    it("is false for a real key", () => {
        expect(isModifierOnly(ev("a"))).toBe(false);
        expect(isModifierOnly(ev("Enter"))).toBe(false);
    });
});

describe("formatCombo", () => {
    it("uses words and arrows on non-mac", () => {
        expect(formatCombo("Control+Shift+Enter", false)).toBe(
            "Ctrl + Shift + Enter",
        );
        expect(formatCombo("Alt+ArrowLeft", false)).toBe("Alt + ←");
        expect(formatCombo("Control+Tab", false)).toBe("Ctrl + Tab");
    });

    it("uppercases single letters for display", () => {
        expect(formatCombo("Control+b", false)).toBe("Ctrl + B");
    });

    it("uses mac symbols when isMac is true", () => {
        expect(formatCombo("Meta+b", true)).toBe("⌘ + B");
        expect(formatCombo("Meta+[", true)).toBe("⌘ + [");
        expect(formatCombo("Control+Alt+Meta+Shift+k", true)).toBe(
            "⌃ + ⌥ + ⌘ + ⇧ + K",
        );
    });

    it("passes ranged display strings through", () => {
        expect(formatCombo("Control+1…9", false)).toBe("Ctrl + 1…9");
    });
});

describe("comboToCodeMirror", () => {
    it("maps our modifier names to CodeMirror's and joins with dashes", () => {
        expect(comboToCodeMirror("Control+b")).toBe("Ctrl-b");
        expect(comboToCodeMirror("Meta+Shift+z")).toBe("Cmd-Shift-z");
        expect(comboToCodeMirror("Shift+Enter")).toBe("Shift-Enter");
        expect(comboToCodeMirror("Alt+ArrowLeft")).toBe("Alt-ArrowLeft");
    });
});
