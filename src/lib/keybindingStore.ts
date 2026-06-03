/**
 * @file Reactive state and global persistence for user keybinding overrides.
 *
 * Overrides are stored app-wide (not per-vault) in a dedicated `keybindings.json`
 * so a user's shortcuts stay consistent across every vault, and so we never race
 * the separate writer that owns `global.settings.json`.
 *
 * The pure merge/conflict logic lives in `keybindingRegistry.ts`; this module is
 * the thin glue that holds the Svelte stores and talks to disk.
 */

import { writable, derived, get } from "svelte/store";
import { LazyStore } from "@tauri-apps/plugin-store";
import {
    mergeBindings,
    findConflictIn,
    findBuiltinClash,
    type BindingDef,
} from "./keybindingRegistry";
import { debounce } from "./utils";
import { log } from "./logger";

const KEYBINDINGS_FILENAME = "keybindings.json";
const STORE_KEY = "customBindings";

/** Created lazily in `loadKeybindings` so importing this module never does IPC. */
let store: LazyStore | null = null;
/** Guards the auto-save subscription so the initial load doesn't write back. */
let loaded = false;

/** User overrides, keyed by action id. Only editable actions ever appear here. */
export const customBindings = writable<Record<string, string[]>>({});

/**
 * True while the Keyboard Shortcuts modal is recording a new combo. The global
 * keydown handler checks this and bails so app shortcuts don't fire mid-capture.
 */
export const isCapturing = writable(false);

/** Defaults merged with overrides: the combos actually in force right now. */
export const effectiveBindings = derived(customBindings, ($custom) =>
    mergeBindings($custom),
);

const persist = debounce(async () => {
    if (!store) return;
    try {
        await store.set(STORE_KEY, get(customBindings));
        await store.save();
    } catch (e) {
        log.error("Failed to save keybindings", e, "keybindings");
    }
}, 400);

/**
 * Loads persisted overrides from disk and wires up auto-save. Call once during
 * app startup, alongside the other global settings.
 */
export async function loadKeybindings(): Promise<void> {
    try {
        store = new LazyStore(KEYBINDINGS_FILENAME);
        const saved = await store.get<Record<string, string[]>>(STORE_KEY);
        customBindings.set(saved ?? {});
    } catch (e) {
        log.error("Failed to load keybindings", e, "keybindings");
        customBindings.set({});
    } finally {
        loaded = true;
        // Subscribe after the initial value is in place so loading is silent.
        customBindings.subscribe(() => {
            if (loaded) persist();
        });
    }
}

/** Overrides a single editable action with a new set of combos. */
export function setBinding(id: string, keys: string[]): void {
    customBindings.update((c) => ({ ...c, [id]: keys }));
}

/** Drops the override for one action, reverting it to its registry default. */
export function resetBinding(id: string): void {
    customBindings.update((c) => {
        if (!(id in c)) return c;
        const next = { ...c };
        delete next[id];
        return next;
    });
}

/** Drops every override, reverting all actions to their defaults. */
export function resetAll(): void {
    customBindings.set({});
}

/**
 * Hard conflict: another editable action already bound to `combo`. Returns the
 * offending definition, or null if the combo is free.
 */
export function findConflict(
    combo: string,
    exceptId: string,
): BindingDef | null {
    return findConflictIn(get(effectiveBindings), combo, exceptId);
}

/** Soft clash: a read-only built-in editor key normally uses `combo`. */
export { findBuiltinClash };
