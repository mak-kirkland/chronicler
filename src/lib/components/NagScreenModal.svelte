<script lang="ts">
    import { onMount } from "svelte";
    import Modal from "$lib/components/Modal.svelte";
    import Button from "$lib/components/Button.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { closeModal } from "$lib/modalStore";
    import { DONATE_URL } from "$lib/config";

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

<Modal
    title="Support Chronicler's Development"
    showCloseButton={false}
    onClose={() => {}}
>
    <div class="nag-content">
        <p>
            You have been using Chronicler for
            <strong>{daysUsed}</strong> days!
        </p>
        <p>
            This app is developed and maintained by a single person (hi, I'm
            Michael!). If you find it valuable, please consider supporting its
            future and <strong>keeping the project alive</strong> :)
        </p>
        <div class="button-group">
            <Button variant="primary" size="large" onclick={handlePurchase}>
                ❤️ Support
            </Button>
            <Button
                variant="primary"
                size="large"
                onclick={closeModal}
                disabled={continueDisabled}
            >
                {#if continueDisabled}
                    Continue ({countdown})
                {:else}
                    Continue
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
