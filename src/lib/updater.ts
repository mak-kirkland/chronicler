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
import UpdateModal from "$lib/components/UpdateModal.svelte";
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
