/**
 * @file Pure helpers for translating between keyboard events, our canonical
 * combo string format, a human-readable label, and CodeMirror's key syntax.
 *
 * Canonical combo format: modifiers in a fixed `Control+Alt+Meta+Shift` order,
 * followed by the key, joined by `+`. Single-letter keys are lowercased so the
 * Shift state lives only in the modifier flag (e.g. `Shift+b`, never `Shift+B`).
 * Examples: `"Control+t"`, `"Alt+ArrowLeft"`, `"Control+Shift+Tab"`, `"Meta+["`.
 *
 * These functions are deliberately free of any Tauri/Svelte/DOM-global state so
 * they can be unit-tested in a plain Node environment.
 */

/** True on macOS. Guarded so importing this module never throws under Node. */
export const IS_MAC =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent || "");

/** The names `event.key` reports when only a modifier is held down. */
const MODIFIER_KEYS = new Set(["Control", "Alt", "Meta", "Shift"]);

type ComboEvent = Pick<
    KeyboardEvent,
    "ctrlKey" | "altKey" | "metaKey" | "shiftKey" | "key"
>;

/**
 * Builds the canonical combo string for a keyboard event. The fixed modifier
 * order matches the legacy global handler so existing default bindings keep
 * matching.
 */
export function eventToCombo(event: ComboEvent): string {
    const parts: string[] = [];
    if (event.ctrlKey) parts.push("Control");
    if (event.altKey) parts.push("Alt");
    if (event.metaKey) parts.push("Meta");
    if (event.shiftKey) parts.push("Shift");

    let key = event.key;
    // Lowercase single printable characters so "Shift+B" and "Shift+b" unify.
    if (key.length === 1) key = key.toLowerCase();
    parts.push(key);

    return parts.join("+");
}

/** True when the event carries only a modifier key (no "real" key yet). */
export function isModifierOnly(event: Pick<KeyboardEvent, "key">): boolean {
    return MODIFIER_KEYS.has(event.key);
}

/** Pretty symbols for arrow/whitespace keys, shared by every platform. */
const KEY_LABELS: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    " ": "Space",
    Escape: "Esc",
};

const MODIFIER_LABELS_MAC: Record<string, string> = {
    Control: "⌃",
    Alt: "⌥",
    Meta: "⌘",
    Shift: "⇧",
};

const MODIFIER_LABELS: Record<string, string> = {
    Control: "Ctrl",
    Alt: "Alt",
    Meta: "Meta",
    Shift: "Shift",
};

/**
 * Renders a combo for display, e.g. `"Control+Shift+Enter"` →
 * `"Ctrl + Shift + Enter"` (or `"⌃ + ⇧ + Enter"` on macOS).
 */
export function formatCombo(combo: string, isMac: boolean = IS_MAC): string {
    const mods = isMac ? MODIFIER_LABELS_MAC : MODIFIER_LABELS;
    return combo
        .split("+")
        .map((part) => {
            if (part in mods) return mods[part];
            if (part in KEY_LABELS) return KEY_LABELS[part];
            // Single letters read better uppercased; everything else verbatim.
            if (part.length === 1) return part.toUpperCase();
            return part;
        })
        .join(" + ");
}

/** CodeMirror's names for our canonical modifiers. */
const CODEMIRROR_MODIFIERS: Record<string, string> = {
    Control: "Ctrl",
    Alt: "Alt",
    Meta: "Cmd",
    Shift: "Shift",
};

/**
 * Converts a canonical combo into CodeMirror keymap syntax, e.g.
 * `"Control+b"` → `"Ctrl-b"`, `"Meta+Shift+z"` → `"Cmd-Shift-z"`.
 */
export function comboToCodeMirror(combo: string): string {
    return combo
        .split("+")
        .map((part) => CODEMIRROR_MODIFIERS[part] ?? part)
        .join("-");
}
