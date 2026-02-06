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

/**
 * The debounce interval in milliseconds for processing backend world updates.
 * This prevents the UI from freezing during high-frequency file system events
 * (like bulk imports or git operations) by grouping them into a single update.
 */
export const WORLD_UPDATE_DEBOUNCE_MS = 500;

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

// --- Paths & URLS ---

/**
 * The URL for donating to the development of Chronicler.
 */
export const DONATE_URL = "https://chronicler.pro/#support";

/**
 * The name of the top-level system folder.
 */
export const SYSTEM_FOLDER_NAME = "_system";

/**
 * The name of the templates folder.
 */
export const TEMPLATE_FOLDER_NAME = "templates";

/**
 * The full path to the templates folder relative to the vault root.
 */
export const TEMPLATE_FOLDER_PATH = `${SYSTEM_FOLDER_NAME}/${TEMPLATE_FOLDER_NAME}`;

/**
 * The name of the special template used as the default for new pages.
 */
export const DEFAULT_TEMPLATE_NAME = "_default";

/**
 * Maximum number of map configs to keep in cache.
 */
export const MAX_CACHED_MAPS = 32;
