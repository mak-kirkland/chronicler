/**
 * @file This module centralizes all global keybinding and shortcut logic.
 *
 * It provides a clean way to define actions and map them to keyboard shortcuts
 * and mouse buttons. This structure is designed to be extensible, allowing for
 * user-configurable keybindings in the future by loading the mappings from a
 * settings store instead of using the hardcoded defaults.
 */

import { navigation } from "$lib/viewStores";

// Define our actions as a type for safety and autocompletion.
type ActionName = "navigateBack" | "navigateForward";

// A map of action names to the functions they should trigger.
// This decouples the keybinding from the action it performs.
const actionHandlers: Record<ActionName, () => void> = {
    navigateBack: navigation.back,
    navigateForward: navigation.forward,
};

// The default keybinding configuration.
// In the future, this could be loaded from and merged with user settings.
const KEYBINDINGS: { keys: string[]; action: ActionName }[] = [
    { keys: ["Alt+ArrowLeft"], action: "navigateBack" },
    {
        keys: ["Alt+ArrowRight"],
        action: "navigateForward",
    },
];

/**
 * Handles the global keydown event, checks for matching shortcuts, and
 * executes the corresponding action.
 */
function handleKeyDown(event: KeyboardEvent) {
    // Construct a simple, consistent representation of the key combination.
    const keyCombo = `${event.ctrlKey ? "Control+" : ""}${event.altKey ? "Alt+" : ""}${event.key}`;

    // Find the action that matches the pressed key combination.
    const binding = KEYBINDINGS.find((b) => b.keys.includes(keyCombo));
    if (binding) {
        event.preventDefault();
        actionHandlers[binding.action]();
    }
}

/**
 * Handles the global pointerup event to detect back/forward mouse button clicks.
 */
function handlePointerUp(event: PointerEvent) {
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
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerup", handlePointerUp);

    // Return a cleanup function that can be called by a Svelte $effect.
    return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("pointerup", handlePointerUp);
    };
}
