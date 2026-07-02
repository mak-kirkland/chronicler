<script lang="ts">
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { exit } from "@tauri-apps/plugin-process";
    import { DONATE_URL } from "$lib/config";
    import { closeModal } from "$lib/modalStore";
    import { t } from "$lib/i18n";

    let { onDismiss = closeModal } = $props<{ onDismiss?: () => void }>();

    async function handleDonate() {
        await openUrl(DONATE_URL);
        await exit(0);
    }

    async function handleMaybeLater() {
        await exit(0);
    }
</script>

<Modal title={$t("donation.title")} showCloseButton={false} onClose={onDismiss}>
    <div class="donation-content">
        <p>{$t("donation.thanks")}</p>
        <p>
            {$t("donation.body")}
        </p>
        <p>{$t("donation.consider")}</p>
        <div class="button-group">
            <Button variant="primary" size="large" onclick={handleDonate}>
                {$t("donation.support")}
            </Button>
            <Button variant="primary" size="large" onclick={handleMaybeLater}>
                {$t("donation.later")}
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
