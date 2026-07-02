<!--
    TelemetryConsentModal.svelte

    Shown once on first launch so the user can make an informed, GDPR-compliant
    choice about the daily anonymous usage ping. Dismissal is only allowed via
    the two explicit choice buttons.
-->
<script lang="ts">
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { setTelemetryEnabled } from "$lib/commands";
    import { log } from "$lib/logger";
    import { t } from "$lib/i18n";

    let { onClose } = $props<{ onClose: () => void }>();

    async function handleChoice(enabled: boolean) {
        try {
            await setTelemetryEnabled(enabled);
        } catch (e) {
            // A persistence failure shouldn't block the user. The default
            // stays "no ping", and they can try again via Settings.
            log.error(
                "Failed to save telemetry preference",
                e,
                "TelemetryModal",
            );
        }
        onClose();
    }
</script>

<Modal title={$t("telemetry.title")} showCloseButton={false} onClose={() => {}}>
    <div class="consent-content">
        <p>
            {$t("telemetry.intro")}
        </p>

        <div class="info-box">
            <h4>{$t("telemetry.whatSent")}</h4>
            <ul>
                <li>{$t("telemetry.sentHash")}</li>
                <li>{$t("telemetry.sentVersion")}</li>
            </ul>

            <h4>{$t("telemetry.whatNever")}</h4>
            <ul>
                <li>{$t("telemetry.neverIdentity")}</li>
                <li>{$t("telemetry.neverIp")}</li>
                <li>{$t("telemetry.neverTracking")}</li>
            </ul>

            <p class="note">
                {$t("telemetry.notePre")}
                <strong>{$t("telemetry.notePath")}</strong>.
            </p>
        </div>

        <div class="button-group">
            <Button variant="ghost" onclick={() => handleChoice(false)}>
                {$t("telemetry.decline")}
            </Button>
            <Button variant="primary" onclick={() => handleChoice(true)}>
                {$t("telemetry.accept")}
            </Button>
        </div>
    </div>
</Modal>

<style>
    .consent-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        line-height: 1.6;
    }
    .consent-content p {
        margin: 0;
    }
    .info-box {
        background-color: var(--color-background-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        padding: 1rem 1.25rem;
    }
    .info-box h4 {
        margin: 0 0 0.5rem 0;
        font-size: 0.95rem;
        color: var(--color-text-primary);
    }
    .info-box h4:not(:first-child) {
        margin-top: 1rem;
    }
    .info-box ul {
        margin: 0;
        padding-left: 1.25rem;
        font-size: 0.9rem;
    }
    .info-box li {
        margin-bottom: 0.35rem;
    }
    .info-box li:last-child {
        margin-bottom: 0;
    }
    .note {
        margin: 1rem 0 0 0 !important;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border-primary);
        font-size: 0.85rem;
        font-style: italic;
        color: var(--color-text-secondary);
    }
    .button-group {
        display: flex;
        gap: 0.75rem;
        justify-content: flex-end;
        margin-top: 0.5rem;
    }
</style>
