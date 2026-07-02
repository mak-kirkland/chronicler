<script lang="ts">
    import { onMount } from "svelte";
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { closeModal } from "$lib/modalStore";
    import { DONATE_URL } from "$lib/config";
    import { t } from "$lib/i18n";

    let { daysUsed } = $props<{ daysUsed: number }>();

    const COUNTDOWN_SECONDS = 6;

    let countdown = $state(COUNTDOWN_SECONDS);
    let continueDisabled = $state(true);

    onMount(() => {
        const timer = setInterval(() => {
            countdown -= 1;
            if (countdown <= 0) {
                clearInterval(timer);
                continueDisabled = false;
            }
        }, 1000);

        // Cleanup function to clear the interval if the component is destroyed
        return () => {
            clearInterval(timer);
        };
    });

    async function handlePurchase() {
        await openUrl(DONATE_URL);
        closeModal();
    }
</script>

<Modal title={$t("nag.title")} showCloseButton={false} onClose={() => {}}>
    <div class="nag-content">
        <p>
            {$t("nag.usingFor", { days: daysUsed })}
        </p>
        <p>
            {$t("nag.body")}
        </p>
        <p>
            {$t("nag.community")}
        </p>
        <div class="button-group">
            <Button variant="primary" size="large" onclick={handlePurchase}>
                {$t("nag.support")}
            </Button>
            <Button
                variant="primary"
                size="large"
                onclick={closeModal}
                disabled={continueDisabled}
            >
                {#if continueDisabled}
                    {$t("nag.continueCountdown", { seconds: countdown })}
                {:else}
                    {$t("nag.continue")}
                {/if}
            </Button>
        </div>
    </div>
</Modal>

<style>
    .nag-content {
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
