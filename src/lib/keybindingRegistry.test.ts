import { describe, it, expect } from "vitest";
import {
    KEYBINDING_REGISTRY,
    mergeBindings,
    findConflictIn,
    findBuiltinClash,
    type BindingDef,
} from "./keybindingRegistry";

const byId = (id: string): BindingDef => {
    const def = KEYBINDING_REGISTRY.find((d) => d.id === id);
    if (!def) throw new Error(`no registry entry "${id}"`);
    return def;
};

describe("KEYBINDING_REGISTRY", () => {
    it("has unique ids", () => {
        const ids = KEYBINDING_REGISTRY.map((d) => d.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("marks built-in editor keys as non-editable", () => {
        const builtins = KEYBINDING_REGISTRY.filter(
            (d) => d.category === "editor-builtin",
        );
        expect(builtins.length).toBeGreaterThan(0);
        expect(builtins.every((d) => !d.editable)).toBe(true);
    });
});

describe("mergeBindings", () => {
    it("returns defaults for every registry entry when there are no overrides", () => {
        const merged = mergeBindings({});
        for (const def of KEYBINDING_REGISTRY) {
            expect(merged[def.id]).toEqual(def.defaultKeys);
        }
    });

    it("applies an override for an editable action", () => {
        const merged = mergeBindings({ newTab: ["Control+y"] });
        expect(merged.newTab).toEqual(["Control+y"]);
    });

    it("ignores overrides for non-editable actions", () => {
        const builtin = KEYBINDING_REGISTRY.find(
            (d) => d.category === "editor-builtin",
        )!;
        const merged = mergeBindings({ [builtin.id]: ["Control+q"] });
        expect(merged[builtin.id]).toEqual(builtin.defaultKeys);
    });
});

describe("findConflictIn", () => {
    const effective = {
        newTab: ["Control+t"],
        editorBold: ["Control+b"],
    };

    it("finds an editable action already using the combo", () => {
        expect(findConflictIn(effective, "Control+t", "closeTab")?.id).toBe(
            "newTab",
        );
    });

    it("ignores the action being edited", () => {
        expect(findConflictIn(effective, "Control+t", "newTab")).toBeNull();
    });

    it("returns null when the combo is free", () => {
        expect(findConflictIn(effective, "Control+j", "newTab")).toBeNull();
    });

    it("does not flag non-editable actions as conflicts", () => {
        const builtin = byId(
            KEYBINDING_REGISTRY.find((d) => d.category === "editor-builtin")!
                .id,
        );
        const combo = builtin.defaultKeys[0];
        // Even if a built-in nominally "uses" the combo, it is not a hard conflict.
        expect(
            findConflictIn({ [builtin.id]: [combo] }, combo, "newTab"),
        ).toBeNull();
    });
});

describe("findBuiltinClash", () => {
    it("matches a built-in editor key's default combo", () => {
        const builtin = KEYBINDING_REGISTRY.find(
            (d) => d.category === "editor-builtin" && d.defaultKeys.length > 0,
        )!;
        expect(findBuiltinClash(builtin.defaultKeys[0])?.id).toBe(builtin.id);
    });

    it("returns null for a combo no built-in uses", () => {
        expect(findBuiltinClash("Control+Alt+Meta+Shift+q")).toBeNull();
    });
});
