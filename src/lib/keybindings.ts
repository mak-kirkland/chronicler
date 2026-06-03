/**
 * @file This module centralizes all global keybinding and shortcut logic.
 *
 * Actions are decoupled from the keys that trigger them: this file owns the
 * action handlers and window listeners, while the combos themselves come from
 * the reactive `keybindingStore` (defaults from `keybindingRegistry`, merged
 * with any user overrides). Binding combos are read lazily at event time, so
 * rebinding in the Keyboard Shortcuts modal takes effect immediately.
 */

import { get } from "svelte/store";
import { navigation, tabs } from "$lib/viewStores";
import { effectiveBindings, isCapturing } from "$lib/keybindingStore";
import { eventToCombo, IS_MAC } from "$lib/keybindingUtils";

// Define our actions as a type for safety and autocompletion.
type ActionName =
    | "navigateBack"
    | "navigateForward"
    | "newTab"
    | "closeTab"
    | "nextTab"
    | "prevTab";

// A map of action names to the functions they should trigger.
// This decouples the keybinding from the action it performs.
const actionHandlers: Record<ActionName, () => void> = {
    navigateBack: navigation.back,
    navigateForward: navigation.forward,
    newTab: () => tabs.newBlankTab(),
    closeTab: () => tabs.closeActive(),
    nextTab: () => tabs.nextTab(),
    prevTab: () => tabs.prevTab(),
};

/**
 * Handles the global keydown event, checks for matching shortcuts, and
 * executes the corresponding action.
 */
function handleKeyDown(event: KeyboardEvent) {
    // While the user is recording a new shortcut, let the modal's capture
    // listener own every keystroke — never fire an app action mid-capture.
    if (get(isCapturing)) return;

    // Jump to tab N: Ctrl/Cmd+1..9 (9 = last tab).
    const jumpMod = IS_MAC ? event.metaKey : event.ctrlKey;
    if (jumpMod && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        const n = Number(event.key);
        tabs.jumpToIndex(n === 9 ? -1 : n - 1);
        return;
    }

    // Match the pressed combo against the current (possibly overridden)
    // bindings for our window-level actions.
    const combo = eventToCombo(event);
    const bindings = get(effectiveBindings);
    for (const action of Object.keys(actionHandlers) as ActionName[]) {
        if (bindings[action]?.includes(combo)) {
            event.preventDefault();
            actionHandlers[action]();
            return;
        }
    }
}

/**
 * Handles the global mouseup event to detect back/forward mouse button clicks.
 *
 * We listen to `mouseup` rather than `pointerup` because WebKitGTK (the webview
 * used by Tauri on Linux) does not reliably emit pointer events for the 4th and
 * 5th mouse buttons.
 */
function handleMouseUp(event: MouseEvent) {
    // On mice with back/forward buttons, these typically correspond to
    // button codes 3 (back) and 4 (forward).
    if (event.button === 3) {
        event.preventDefault();
        actionHandlers.navigateBack();
    }
    if (event.button === 4) {
        event.preventDefault();
        actionHandlers.navigateForward();
    }
}

/**
 * Attaches all global keybinding listeners to the window.
 *
 * This function should be called once when the main application component mounts.
 *
 * @returns A cleanup function to remove the event listeners when the application unmounts.
 */
export function initializeKeybindings(): () => void {
    // Capture phase so global tab/navigation shortcuts (Ctrl+W/T/Tab, Ctrl+1-9)
    // are handled before focused widgets like CodeMirror can swallow them.
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("mouseup", handleMouseUp);

    // Return a cleanup function that can be called by a Svelte $effect.
    return () => {
        window.removeEventListener("keydown", handleKeyDown, true);
        window.removeEventListener("mouseup", handleMouseUp);
    };
}
