/**
 * @file The single catalogue of every keyboard shortcut Chronicler knows about.
 *
 * This is the source of truth the Keyboard Shortcuts UI renders from, and where
 * the platform-aware defaults live. It carries no runtime wiring — which command
 * actually fires lives with the runtime (`keybindings.ts` for app shortcuts,
 * `Editor.svelte` for editor commands). Keeping this Tauri-free makes the merge
 * and conflict helpers below unit-testable under plain Node.
 */

import { IS_MAC } from "./keybindingUtils";

export type BindingCategory = "navigation" | "editor" | "editor-builtin";

/**
 * Ids of the rebindable editor commands. `Editor.svelte` maps each of these to
 * a CodeMirror command; exporting the union lets that mapping be type-checked,
 * so a typo or a renamed id becomes a compile error rather than a silently
 * dead shortcut.
 */
export type EditorCommandId =
    | "editorBold"
    | "editorItalic"
    | "editorForceWikilink"
    | "editorAcceptCompletion";

export interface BindingDef {
    /** Stable identifier, also the key used in the persisted overrides map. */
    id: string;
    /** Human-readable action name shown in the UI. */
    label: string;
    /** Optional one-line explanation. */
    description?: string;
    category: BindingCategory;
    /** Canonical combo strings (see keybindingUtils). May be empty. */
    defaultKeys: string[];
    /** Whether the user may rebind this. Built-ins are display-only. */
    editable: boolean;
    /** Extra hint shown beside the chip, e.g. alternate inputs. */
    note?: string;
}

/**
 * The catalogue. Order here is the order rows render within their group.
 *
 * `navigation` — global app shortcuts handled at the window level.
 * `editor`     — Chronicler's own CodeMirror commands.
 * `editor-builtin` — a curated, read-only sample of CodeMirror's built-in keys
 *                    (the library exposes no labels, so we name a useful subset).
 */
export const KEYBINDING_REGISTRY: BindingDef[] = [
    // --- Navigation & tabs (editable) ---
    {
        id: "navigateBack",
        label: "Navigate back",
        category: "navigation",
        defaultKeys: IS_MAC ? ["Meta+["] : ["Alt+ArrowLeft"],
        editable: true,
        note: "Also: mouse back button",
    },
    {
        id: "navigateForward",
        label: "Navigate forward",
        category: "navigation",
        defaultKeys: IS_MAC ? ["Meta+]"] : ["Alt+ArrowRight"],
        editable: true,
        note: "Also: mouse forward button",
    },
    {
        id: "newTab",
        label: "New tab",
        category: "navigation",
        defaultKeys: IS_MAC ? ["Meta+t"] : ["Control+t"],
        editable: true,
    },
    {
        id: "closeTab",
        label: "Close tab",
        category: "navigation",
        defaultKeys: IS_MAC ? ["Meta+w"] : ["Control+w"],
        editable: true,
    },
    {
        id: "nextTab",
        label: "Next tab",
        category: "navigation",
        defaultKeys: ["Control+Tab"],
        editable: true,
    },
    {
        id: "prevTab",
        label: "Previous tab",
        category: "navigation",
        defaultKeys: ["Control+Shift+Tab"],
        editable: true,
    },
    {
        id: "jumpToTab",
        label: "Jump to tab 1–9",
        description: "9 jumps to the last tab.",
        category: "navigation",
        // A numeric range, not a single combo — shown for reference only.
        defaultKeys: IS_MAC ? ["Meta+1…9"] : ["Control+1…9"],
        editable: false,
    },

    // --- Editor commands (editable) ---
    {
        id: "editorBold",
        label: "Bold",
        category: "editor",
        defaultKeys: IS_MAC ? ["Meta+b"] : ["Control+b"],
        editable: true,
    },
    {
        id: "editorItalic",
        label: "Italic",
        category: "editor",
        defaultKeys: IS_MAC ? ["Meta+i"] : ["Control+i"],
        editable: true,
    },
    {
        id: "editorForceWikilink",
        label: "Complete wikilink / exit brackets",
        category: "editor",
        defaultKeys: ["Shift+Enter"],
        editable: true,
    },
    {
        id: "editorAcceptCompletion",
        label: "Accept autocomplete suggestion",
        category: "editor",
        defaultKeys: ["Tab"],
        editable: true,
    },

    // --- CodeMirror built-ins (read-only reference) ---
    {
        id: "builtinUndo",
        label: "Undo",
        category: "editor-builtin",
        defaultKeys: IS_MAC ? ["Meta+z"] : ["Control+z"],
        editable: false,
    },
    {
        id: "builtinRedo",
        label: "Redo",
        category: "editor-builtin",
        defaultKeys: IS_MAC ? ["Meta+Shift+z"] : ["Control+Shift+z"],
        editable: false,
    },
    {
        id: "builtinSelectAll",
        label: "Select all",
        category: "editor-builtin",
        defaultKeys: IS_MAC ? ["Meta+a"] : ["Control+a"],
        editable: false,
    },
    {
        id: "builtinDeleteLine",
        label: "Delete line",
        category: "editor-builtin",
        defaultKeys: IS_MAC ? ["Meta+Shift+k"] : ["Control+Shift+k"],
        editable: false,
    },
    {
        id: "builtinMoveLineUp",
        label: "Move line up",
        category: "editor-builtin",
        defaultKeys: ["Alt+ArrowUp"],
        editable: false,
    },
    {
        id: "builtinMoveLineDown",
        label: "Move line down",
        category: "editor-builtin",
        defaultKeys: ["Alt+ArrowDown"],
        editable: false,
    },
    {
        id: "builtinIndentLess",
        label: "Indent less",
        category: "editor-builtin",
        defaultKeys: IS_MAC ? ["Meta+["] : ["Control+["],
        editable: false,
    },
    {
        id: "builtinIndentMore",
        label: "Indent more",
        category: "editor-builtin",
        defaultKeys: IS_MAC ? ["Meta+]"] : ["Control+]"],
        editable: false,
    },
];

/**
 * Merges user overrides over the registry defaults, producing the effective
 * combo list for every action. Overrides are honoured only for editable
 * actions; built-ins always show their defaults.
 */
export function mergeBindings(
    custom: Record<string, string[]>,
): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const def of KEYBINDING_REGISTRY) {
        const override = def.editable ? custom[def.id] : undefined;
        out[def.id] = override ?? def.defaultKeys;
    }
    return out;
}

/**
 * Finds an editable action (other than `exceptId`) that already uses `combo`
 * in the given effective map. Built-ins are never hard conflicts.
 */
export function findConflictIn(
    effective: Record<string, string[]>,
    combo: string,
    exceptId: string,
): BindingDef | null {
    for (const def of KEYBINDING_REGISTRY) {
        if (!def.editable || def.id === exceptId) continue;
        if (effective[def.id]?.includes(combo)) return def;
    }
    return null;
}

/**
 * Finds a read-only built-in editor key whose default combo equals `combo`,
 * used to surface a non-blocking "this normally does X" warning.
 */
export function findBuiltinClash(combo: string): BindingDef | null {
    for (const def of KEYBINDING_REGISTRY) {
        if (def.category !== "editor-builtin") continue;
        if (def.defaultKeys.includes(combo)) return def;
    }
    return null;
}
