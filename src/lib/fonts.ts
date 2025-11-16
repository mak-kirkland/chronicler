/**
 * @file Manages all logic for loading and injecting user-provided fonts.
 *
 * This service handles discovering fonts on the user's filesystem,
 * generating the necessary `@font-face` rules using Tauri's asset protocol,
 * and injecting those rules into the document head. It provides functions
 * to load only the active fonts (for startup) and all fonts (for the settings modal).
 */

import { get } from "svelte/store";
import { headingFont, bodyFont, userFonts } from "$lib/settingsStore";
import { getUserFonts } from "$lib/commands";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { UserFont } from "$lib/bindings";

// --- Private Cache ---

/**
 * Tracks which font *family names* we have already injected into the DOM.
 * This avoids reading from the stylesheet and prevents duplicate injections.
 */
const injectedFontNames = new Set<string>();

// --- Private DOM Functions ---

/**
 * Ensures the <style> tag for user fonts exists.
 * @returns The CSSStyleSheet object to inject rules into.
 */
function getFontStylesheet(): CSSStyleSheet | null {
    const styleId = "chronicler-user-fonts";
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;

    if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
    }

    const sheet = styleElement.sheet;
    if (!sheet) {
        console.error("Could not access style sheet to inject fonts.");
        return null;
    }
    return sheet;
}

/**
 * Injects a list of font faces into the DOM.
 * This is `async` to correctly handle `convertFileSrc`.
 * @param fonts The list of user fonts to inject.
 */
async function injectFontFaces(fonts: UserFont[]) {
    const sheet = getFontStylesheet();
    if (!sheet) return;

    // Use Promise.all to convert all asset URLs in parallel first.
    const fontRules = await Promise.all(
        fonts.map(async (font) => {
            if (injectedFontNames.has(font.name)) {
                return null; // Don't create a rule if font is already injected
            }

            const assetUrl = await convertFileSrc(font.path);
            return {
                name: font.name,
                rule: `
                    @font-face {
                        font-family: "${font.name}";
                        src: url(${assetUrl});
                    }
                `,
            };
        }),
    );

    // Now, synchronously inject the text-based rules. This is fast.
    for (const font of fontRules) {
        if (font) {
            try {
                sheet.insertRule(font.rule, sheet.cssRules.length);
                // On success, add it to our Set.
                injectedFontNames.add(font.name);
            } catch (e) {
                console.warn(`Failed to inject font rule for '${font.name}':`, e);
            }
        }
    }
}

// --- Private Backend Function ---

/**
 * A cached function to get all user fonts from the backend.
 * It uses the `userFonts` store as its cache.
 * @param force Reread from disk, ignoring the cache.
 */
async function getAllUserFonts(force = false): Promise<UserFont[]> {
    const cachedFonts = get(userFonts);
    if (cachedFonts.length > 0 && !force) {
        return cachedFonts;
    }

    try {
        const fonts = await getUserFonts();
        userFonts.set(fonts); // Set the store, which is our cache
        return fonts;
    } catch (e) {
        console.error("Failed to get user fonts from backend:", e);
        return []; // Return empty on failure
    }
}

// --- Public API ---

/**
 * Fetches *only* the user's actively selected fonts and injects them.
 * This is called on startup to prevent FOUC.
 */
export async function loadActiveFonts() {
    try {
        // First, ensure the full list is populated in the store (uses cache if available)
        const allUserFonts = await getAllUserFonts();
        if (allUserFonts.length === 0) return; // No user fonts to load

        const activeHeadingFont = get(headingFont).replace(/["']/g, "");
        const activeBodyFont = get(bodyFont).replace(/["']/g, "");

        const activeFonts = allUserFonts.filter(
            (font) =>
                font.name === activeHeadingFont || font.name === activeBodyFont,
        );

        if (activeFonts.length > 0) {
            // Await the injection to ensure rules exist before render
            await injectFontFaces(activeFonts);
        }
    } catch (e) {
        console.error("Failed to load active user fonts:", e);
    }
}

/**
 * Fetches the *full list* of user fonts and populates the store
 * for the settings modal dropdown.
 */
export async function loadAllUserFonts() {
    try {
        // Get all fonts (populates store/cache if empty)
        const fonts = await getAllUserFonts();
        // We also inject them all here, so they are available for theme previews.
        await injectFontFaces(fonts);
    } catch (e) {
        console.error("Failed to load all user fonts:", e);
    }
}
