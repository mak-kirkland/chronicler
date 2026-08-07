<script lang="ts">
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { closeModal } from "$lib/modalStore";
    import { CONTEST_VOTE_URL } from "$lib/contestAnnouncement";
    import type { ContestMascot } from "$lib/data/contestMascots";

    let { mascots } = $props<{ mascots: ContestMascot[] }>();

    async function handleVote() {
        await openUrl(CONTEST_VOTE_URL);
        closeModal();
    }
</script>

<Modal
    title="The finalists are in — cast your vote!"
    showCloseButton={true}
    onClose={closeModal}
>
    <div class="contest-content">
        <p class="intro">
            The community designed 23 mascots for Chronicler, and round one
            narrowed them down to these eight. One of them becomes the face of
            the app — the final call is yours.
        </p>

        <ul class="finalists">
            {#each mascots as mascot (mascot.slug)}
                <li class="finalist">
                    <img src={mascot.image} alt={mascot.name} />
                    <span class="name">{mascot.name}</span>
                    {#if mascot.creator}
                        <span class="creator">{mascot.creator}</span>
                    {/if}
                </li>
            {/each}
        </ul>

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
        gap: 0.9rem;
        text-align: center;
        line-height: 1.6;
    }
    .intro {
        margin: 0;
        font-size: 1rem;
    }
    .finalists {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        /* Eight finalists, so a fixed four columns splits them evenly into two
           rows. Deliberately not auto-fit: letting the count follow the
           available width gives a ragged 5-then-3 split, which reads as a
           rank rather than a field of equals. */
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.85rem 0.5rem;
    }
    .finalist {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.15rem;
        min-width: 0;
    }
    .finalist img {
        /* A fixed box keeps the rows aligned no matter how each entry's artwork
           is proportioned. Scaling with the viewport keeps all eight inside the
           modal body's 70vh cap on a laptop screen — voters should be able to
           compare the full field without scrolling — while letting the artwork
           breathe on a larger display. */
        height: clamp(74px, 9.5vh, 116px);
        width: 100%;
        object-fit: contain;
        margin-bottom: 0.25rem;
    }
    .name {
        font-size: 0.92rem;
        font-weight: bold;
        color: var(--color-text-heading, var(--color-text-primary));
        line-height: 1.25;
    }
    .creator {
        font-size: 0.78rem;
        color: var(--color-text-secondary);
        line-height: 1.25;
    }
    /* Eight portraits overflow the modal body's 70vh cap on a short window,
       which would bury the vote button — the one thing this splash exists to
       offer. Pinning it to the bottom of the scroll area keeps it reachable at
       any window height while the grid scrolls behind it. */
    .button-group {
        position: sticky;
        bottom: 0;
        display: flex;
        gap: 0.75rem;
        justify-content: center;
        align-items: center;
        padding: 0.75rem 0 0.25rem;
        background-color: var(--color-background-primary);
        border-top: 1px solid var(--color-border-primary);
    }

    /* Below the modal's own max-width it goes full-bleed, so viewport width is
       a fair proxy for how much room the grid has. */
    @media (max-width: 560px) {
        .finalists {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>
