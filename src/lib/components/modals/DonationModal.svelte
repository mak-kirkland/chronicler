<script lang="ts">
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { exit } from "@tauri-apps/plugin-process";
    import { DONATE_URL } from "$lib/config";

    async function handleDonate() {
        await openUrl(DONATE_URL);
        await exit(0);
    }

    async function handleMaybeLater() {
        await exit(0);
    }
</script>

<Modal title="Enjoying Chronicler?" showCloseButton={false}>
    <div class="donation-content">
        <p>Thank you for using Chronicler!</p>
        <p>
            As a solo developer, your support is invaluable for <strong
                >keeping the project alive</strong
            >.
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
