/**
 * @file This module centralizes all logic related to application updates.
 * It uses the Tauri Updater plugin to check for new versions, handle platform-specific
 * installation requirements (like for Linux .deb/.rpm packages), and trigger the
 * installation process.
 */

import { check, type Update } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import { platform } from "@tauri-apps/plugin-os";
import { relaunch } from "@tauri-apps/plugin-process";
import { openModal, closeModal } from "$lib/modalStore";
import UpdateModal from "$lib/components/modals/UpdateModal.svelte";
import { getLinuxInstallType } from "./commands";

/**
 * Checks for application updates using Tauri v2 plugins.
 * - On Linux, it invokes a custom Rust command to determine the installation type.
 * - If the install is not an AppImage, it directs the user to update manually.
 */
export async function checkForAppUpdates() {
    try {
        console.log("Checking for update...");
        const update = await check();

        if (update) {
            const platformName = platform();
            let manualUpdateRequired = false;

            if (platformName === "linux") {
                const installType = await getLinuxInstallType();
                if (installType !== "appimage") {
                    manualUpdateRequired = true;
                }
            }

            console.log(`Update found: ${update.version}`);
            openModal({
                component: UpdateModal,
                props: {
                    update,
                    manualUpdateRequired,
                    onClose: closeModal,
                },
            });
        } else {
            console.log("No update available.");
        }
    } catch (error) {
        console.error("Update check failed:", error);
    }
}

/**
 * Opens the latest release page in the user's browser.
 */
export function openReleasePage() {
    openUrl("https://github.com/mak-kirkland/chronicler/releases/latest");
}

/**
 * Triggers the Tauri updater to install the update and then relaunches the application.
 * @param {Update} update - The update object from the `check` function.
 */
export async function installUpdate(update: Update) {
    await update.downloadAndInstall();
    await relaunch();
}

/**
 * Takes the raw markdown from the update payload (`update.body`), extracts all
 * list items, and formats them into a single, alphabetized list,
 * grouped by category, similar to REAPER's changelog.
 */
export function formatChangelog(
    rawText: string | null,
    version: string | null,
): string | null {
    if (!rawText || !version) return null;

    // 1. Slice the text to get only the content *before* the user's version.
    const versionHeader = `## [v${version}`;
    const versionIndex = rawText.indexOf(versionHeader);
    const relevantText =
        versionIndex !== -1 ? rawText.substring(0, versionIndex) : rawText;

    const changes: { category: string; description: string }[] = [];
    // Regex to capture the category (in bold) and the description from a list item.
    const lineRegex = /-\s*\*\*(.*?)\*\*:\s*(.*)/;

    // 2. Parse each line to extract change items.
    relevantText.split("\n").forEach((line) => {
        const match = line.trim().match(lineRegex);
        if (match) {
            // match[1] is the category, match[2] is the description.
            changes.push({ category: match[1], description: match[2] });
        }
    });

    if (changes.length === 0) {
        return "No detailed release notes available.";
    }

    // 3. Sort the changes alphabetically by category, then by description.
    changes.sort((a, b) => {
        if (a.category.toLowerCase() < b.category.toLowerCase()) return -1;
        if (a.category.toLowerCase() > b.category.toLowerCase()) return 1;
        if (a.description.toLowerCase() < b.description.toLowerCase())
            return -1;
        if (a.description.toLowerCase() > b.description.toLowerCase()) return 1;
        return 0;
    });

    // 4. Format the sorted list for display as a Markdown list.
    return changes
        .map((change) => `- **${change.category}**: ${change.description}`)
        .join("\n");
}
