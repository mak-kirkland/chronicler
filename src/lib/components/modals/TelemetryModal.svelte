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

    let { onClose } = $props<{ onClose: () => void }>();

    async function handleChoice(enabled: boolean) {
        try {
            await setTelemetryEnabled(enabled);
        } catch (e) {
            // A persistence failure shouldn't block the user. The default
            // stays "no ping", and they can try again via Settings.
            console.error("Failed to save telemetry preference:", e);
        }
        onClose();
    }
</script>

<Modal title="Help Chronicler Grow" showCloseButton={false} onClose={() => {}}>
    <div class="consent-content">
        <p>
            Hi, I'm Michael, the developer. Chronicler is a solo project, and
            knowing roughly how many people are using it helps me justify the
            time I spend maintaining and improving it.
        </p>

        <div class="info-box">
            <h4>What gets sent</h4>
            <ul>
                <li>
                    A <strong>salted one-way hash</strong> of your machine ID (not
                    reversible)
                </li>
                <li>The app version and your OS family</li>
            </ul>

            <h4>What is never sent</h4>
            <ul>
                <li>Your name, email, vault contents, or filenames</li>
                <li>Your IP address is not stored on the server</li>
                <li>No tracking, no profiling, no third parties</li>
            </ul>

            <p class="note">
                You can change your mind anytime in
                <strong>Settings → Privacy</strong>.
            </p>
        </div>

        <div class="button-group">
            <Button variant="ghost" onclick={() => handleChoice(false)}>
                No Thanks
            </Button>
            <Button variant="primary" onclick={() => handleChoice(true)}>
                Sure, Count Me In
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
