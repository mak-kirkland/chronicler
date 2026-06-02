/**
 * @file This module centralizes all global keybinding and shortcut logic.
 *
 * It provides a clean way to define actions and map them to keyboard shortcuts
 * and mouse buttons. This structure is designed to be extensible, allowing for
 * user-configurable keybindings in the future by loading the mappings from a
 * settings store instead of using the hardcoded defaults.
 */

import { navigation, tabs } from "$lib/viewStores";

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

// Detect macOS to use platform-appropriate shortcuts.
// On macOS, Alt+Arrow is used for word-level cursor movement in text fields,
// so we use Cmd+[ / Cmd+] instead (the standard browser back/forward shortcut).
const isMac = navigator.platform.toUpperCase().includes("MAC");

// The default keybinding configuration.
// In the future, this could be loaded from and merged with user settings.
const KEYBINDINGS: { keys: string[]; action: ActionName }[] = [
    {
        keys: isMac ? ["Meta+["] : ["Alt+ArrowLeft"],
        action: "navigateBack",
    },
    {
        keys: isMac ? ["Meta+]"] : ["Alt+ArrowRight"],
        action: "navigateForward",
    },
    { keys: isMac ? ["Meta+t"] : ["Control+t"], action: "newTab" },
    { keys: isMac ? ["Meta+w"] : ["Control+w"], action: "closeTab" },
    { keys: ["Control+Tab"], action: "nextTab" },
    { keys: ["Control+Shift+Tab"], action: "prevTab" },
];

/**
 * Handles the global keydown event, checks for matching shortcuts, and
 * executes the corresponding action.
 */
function handleKeyDown(event: KeyboardEvent) {
    // Jump to tab N: Ctrl/Cmd+1..9 (9 = last tab).
    const jumpMod = isMac ? event.metaKey : event.ctrlKey;
    if (jumpMod && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        const n = Number(event.key);
        tabs.jumpToIndex(n === 9 ? -1 : n - 1);
        return;
    }

    // Construct a simple, consistent representation of the key combination.
    const keyCombo = `${event.ctrlKey ? "Control+" : ""}${event.altKey ? "Alt+" : ""}${event.metaKey ? "Meta+" : ""}${event.shiftKey ? "Shift+" : ""}${event.key}`;

    // Find the action that matches the pressed key combination.
    const binding = KEYBINDINGS.find((b) => b.keys.includes(keyCombo));
    if (binding) {
        event.preventDefault();
        actionHandlers[binding.action]();
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
