<script lang="ts">
    import Modal from "$lib/components/Modal.svelte";
    import Button from "$lib/components/Button.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { exit } from "@tauri-apps/plugin-process";
    import { setHideDonationPrompt } from "$lib/settingsStore";

    const PATREON_URL = "https://patreon.com/ChroniclerNotes";

    async function handleDonate() {
        await setHideDonationPrompt();
        await openUrl(PATREON_URL);
        await exit(0);
    }

    async function handleMaybeLater() {
        await exit(0);
    }
</script>

<Modal title="Enjoying Chronicler?" showCloseButton={false}>
    <div class="donation-content">
        <p>
            Thank you for using Chronicler! As a solo developer, your support is
            invaluable for maintaining and improving this application.
        </p>
        <p>If you find it useful, please consider supporting its future.</p>
        <div class="button-group">
            <Button variant="primary" size="large" onclick={handleDonate}>
                ❤️ Yes, I'll Support!
            </Button>
            <Button variant="primary" size="large" onclick={handleMaybeLater}>
                Maybe Later
            </Button>
        </div>
    </div>
</Modal>

<style>
    .donation-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        text-align: center;
        font-size: 1.1rem;
        line-height: 1.6;
    }
    .button-group {
        display: flex;
        gap: 1rem;
        justify-content: center;
        margin-top: 1.5rem;
    }
</style>
