/**
 * @file Manages the application's licensing state.
 *
 * This store handles checking for an existing license on startup,
 * provides functions to attempt verification of a new license key,
 * and holds the reactive state for the UI to display.
 */

import { writable, derived } from "svelte/store";
import { getLicenseStatus, verifyAndStoreLicense } from "./commands";
import type { License } from "./bindings";

/** The possible states of the license. */
export type LicenseStatus = "loading" | "unlicensed" | "licensed" | "invalid";

/** Defines the shape of the license store's state. */
export interface LicenseState {
    status: LicenseStatus;
    license: License | null;
    error?: string;
}

// We capture the store object itself so we can use it for derived stores
const store = writable<LicenseState>({
    status: "loading",
    license: null,
});

const { subscribe, set, update } = store;

/**
 * Derived store that returns true if the current license permits Map usage.
 * Useful for feature gating UI elements.
 */
export const hasMapsEntitlement = derived(store, ($state) => {
    return $state.license?.entitlements.includes("maps") ?? false;
});

/**
 * Attempts to verify a new license key with the backend.
 * Updates the store with the result.
 * @param licenseKey The raw string content of the license file.
 * @returns A promise that resolves to true if verification was successful, false otherwise.
 */
async function attemptLicenseVerification(
    licenseKey: string,
): Promise<boolean> {
    try {
        const validatedLicense = await verifyAndStoreLicense(licenseKey);
        set({ status: "licensed", license: validatedLicense });
        return true;
    } catch (e: any) {
        console.error("License verification failed:", e);
        // Keep the old license if the new one is invalid
        update((s) => ({
            ...s,
            status: s.license ? "licensed" : "invalid",
            error: e,
        }));
        return false;
    }
}

/**
 * Checks for a stored license on application startup.
 * This should be called once when the app initializes.
 */
async function initializeLicense() {
    try {
        const license = await getLicenseStatus();
        if (license) {
            set({ status: "licensed", license });
            console.log("License verified:", license);
        } else {
            set({ status: "unlicensed", license: null });
        }
    } catch (e: any) {
        console.error("Failed to get license status:", e);
        set({ status: "invalid", license: null, error: e });
    }
}

export const licenseStore = {
    subscribe,
    initialize: initializeLicense,
    verify: attemptLicenseVerification,
};
