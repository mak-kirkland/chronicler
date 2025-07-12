/**
 * @file This file contains global configuration constants for the frontend application.
 * Centralizing these values makes it easy to adjust application-wide behavior, such
 * as UI timings and layout constraints, from a single location.
 */

// --- Editor & Saving ---

/**
 * The debounce interval in milliseconds for the auto-save feature in the editor.
 * This is the amount of time to wait after the user stops typing before saving.
 */
export const AUTOSAVE_DEBOUNCE_MS = 500;

// --- UI Layout ---

/**
 * The initial width in pixels that the sidebar is set to.
 */
export const SIDEBAR_INITIAL_WIDTH = 300;

/**
 * The minimum width in pixels that the sidebar can be resized to.
 */
export const SIDEBAR_MIN_WIDTH = 200;

/**
 * The maximum width in pixels that the sidebar can be resized to.
 */
export const SIDEBAR_MAX_WIDTH = 400;

/**
 * The number of pixels to adjust the sidebar width by when using keyboard controls.
 */
export const SIDEBAR_KEYBOARD_RESIZE_STEP = 10;
