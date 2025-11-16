/**
 * @file This file centralizes the application's startup and initialization logic.
 */

import { resetAllStores } from "$lib/viewStores";
import { appStatus } from "$lib/appState";
import { world } from "$lib/worldStore";
import { initializeVault } from "$lib/actions";
import { getVaultPath, getAppUsageDays } from "$lib/commands";
import {
    loadGlobalSettings,
    initializeVaultSettings,
    destroyVaultSettings,
} from "$lib/settingsStore";
import { loadActiveFonts } from "$lib/fonts";
import { checkForAppUpdates } from "$lib/updater";
import { licenseStore } from "./licenseStore";
import { get } from "svelte/store";
import { openModal } from "./modalStore";
import NagScreenModal from "./components/NagScreenModal.svelte";

/**
 * Orchestrates the complete vault initialization sequence. This function is the
 * primary entry point after a vault path is chosen.
 * @param path The absolute path to the selected vault directory.
 */
export async function handleVaultSelected(path: string) {
    appStatus.set({ state: "loading" });
    try {
        // 1. Initialize the backend state. This must complete first.
        await initializeVault(path);

        // 2. Initialize frontend stores and vault-specific settings
        //    in parallel, as they do not depend on each other.
        await Promise.all([world.initialize(), initializeVaultSettings(path)]);

        // 3. Load active fonts *after* vault settings are loaded
        //    (since it depends on them) and *before* we set the app to "ready".
        //    This ensures the correct @font-face rules exist before the UI renders.
        await loadActiveFonts();

        // 4. Set status to ready ONLY after everything is finished
        appStatus.set({ state: "ready" });

        // 5. After the app is ready, check for updates in the background.
        checkForAppUpdates();
    } catch (e: any) {
        appStatus.set({ state: "error", message: e.message });
    }
}

/**
 * The main application entry point, called on mount from the root layout.
 * It loads settings, finds the last-used vault path, and kicks off initialization.
 */
export async function initializeApp() {
    try {
        // Load global settings and license status that apply to the whole application first.
        await Promise.all([loadGlobalSettings(), licenseStore.initialize()]);

        // Then, check if a vault was already open from the last session.
        const path = await getVaultPath();
        if (path) {
            await handleVaultSelected(path);
        } else {
            appStatus.set({ state: "selecting_vault" });
        }

        // Defer the non-critical "nag screen" check. We wrap it in an async
        // IIFE (Immediately Invoked Function Expression) to "fire-and-forget".
        (async () => {
            const license = get(licenseStore);
            if (license.status !== "licensed") {
                const daysUsed = await getAppUsageDays();
                if (daysUsed >= 30) {
                    openModal({
                        component: NagScreenModal,
                        props: { daysUsed },
                    });
                }
            }
        })();
    } catch (e: any) {
        console.error("Failed during startup initialization:", e);
        const errorMessage = e.message || `Failed to read configuration: ${e}`;
        appStatus.set({ state: "error", message: errorMessage });
    }
}

/**
 * Resets the application state to allow the user to select a new vault.
 * It destroys the current world state, resets all UI stores, and then
 * explicitly sets the application status back to the vault selection screen.
 */
export function selectNewVault() {
    // Destroy the state for the vault that is being closed.
    world.destroy();
    destroyVaultSettings(); // Also destroy the settings associated with the closed vault.
    resetAllStores();

    appStatus.set({ state: "selecting_vault" });
}
