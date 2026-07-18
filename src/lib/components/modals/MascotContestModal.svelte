<script lang="ts">
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { closeModal } from "$lib/modalStore";
    import { CONTEST_VOTE_URL } from "$lib/contestAnnouncement";
    import type { ContestMascot } from "$lib/data/contestMascots";

    let { mascot } = $props<{ mascot: ContestMascot }>();

    async function handleVote() {
        await openUrl(CONTEST_VOTE_URL);
        closeModal();
    }
</script>

<Modal
    title="Vote for Chronicler's mascot!"
    showCloseButton={true}
    onClose={closeModal}
>
    <div class="contest-content">
        <p class="intro">
            The community designed 23 mascots for Chronicler. Now it's time to
            crown the winner! Say hello to one of the contenders:
        </p>

        <figure class="mascot">
            <img src={mascot.image} alt={mascot.name} />
            <figcaption>
                <span class="name">{mascot.name}</span>
                {#if mascot.subtitle}
                    <span class="subtitle">{mascot.subtitle}</span>
                {/if}
            </figcaption>
        </figure>

        {#if mascot.creator}
            <p class="creator">Designed by {mascot.creator}</p>
        {/if}

        <div class="button-group">
            <Button variant="ghost" onclick={closeModal}>Maybe later</Button>
            <Button variant="primary" onclick={handleVote}>Vote now</Button>
        </div>
    </div>
</Modal>

<style>
    .contest-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        text-align: center;
        line-height: 1.6;
    }
    .intro {
        font-size: 1.1rem;
        margin: 0;
    }
    .mascot {
        margin: 0.5rem 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
    }
    .mascot img {
        max-height: 240px;
        max-width: 100%;
        width: auto;
        object-fit: contain;
    }
    .mascot figcaption {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
    }
    .name {
        font-size: 1.3rem;
        font-weight: bold;
        color: var(--color-text-heading, var(--color-text-primary));
    }
    .subtitle {
        font-style: italic;
        color: var(--color-text-secondary);
    }
    .creator {
        margin: 0;
        font-size: 0.9rem;
        color: var(--color-text-secondary);
    }
    .button-group {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
        align-items: center;
        margin-top: 0.5rem;
    }
</style>
