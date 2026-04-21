/**
 * @file Startup helper for the telemetry consent flow.
 *
 * Checks whether the user has seen the consent prompt. If not, opens the
 * TelemetryConsentModal so they can make an informed choice before any
 * analytics ping is ever sent.
 *
 * The backend side of the contract is strict: `main.rs` only fires the
 * ping when `config.telemetry_enabled == Some(true)`. Never-chosen and
 * explicitly-declined both result in no ping. That means the consent
 * modal timing is not safety-critical — even if it were shown late or
 * skipped, no data would leak.
 *
 */

import { getTelemetrySettings } from "$lib/commands";
import { openModal, closeModal } from "$lib/modalStore";
import TelemetryConsentModal from "$lib/components/modals/TelemetryModal.svelte";

/**
 * Checks whether the telemetry consent modal should be shown, and opens it
 * if so.
 *
 * This should be called once per app session, after the modal system is
 * ready. If the user has already made a choice (either opt-in or opt-out)
 * in a previous session, this is a no-op.
 *
 * Errors are logged but not rethrown: failing to check consent state
 * should not prevent the rest of the app from loading. The safe default
 * (no ping) remains in effect even if this function fails.
 */
export async function checkTelemetryConsent(): Promise<void> {
    try {
        const settings = await getTelemetrySettings();

        // Only show the prompt if the user has never seen it before.
        // Once `consentShown` is true, we respect their previous choice
        // and they can still change it via Settings → Privacy.
        if (!settings.consentShown) {
            openModal({
                component: TelemetryConsentModal,
                props: { onClose: closeModal },
            });
        }
    } catch (e) {
        // If we can't read the config for some reason (permissions, corruption,
        // etc.), we log and skip the prompt. The default is "no ping", so
        // this is safe — the user simply won't be asked until the issue is
        // resolved on a future launch.
        console.error("Failed to check telemetry consent state:", e);
    }
}
