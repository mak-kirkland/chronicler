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
    title="It's down to the final two — cast your vote!"
    showCloseButton={true}
    onClose={closeModal}
>
    <div class="contest-content">
        <p class="intro">
            The community designed 23 mascots for Chronicler, and two rounds of
            voting have narrowed it down to the final two! Who will be the new
            Chronicler Mascot?
        </p>

        <ul class="finalists">
            {#each mascots as mascot, i (mascot.slug)}
                <li class="finalist">
                    <img src={mascot.image} alt={mascot.name} />
                    <span class="name">{mascot.name}</span>
                    {#if mascot.creator}
                        <span class="creator">{mascot.creator}</span>
                    {/if}
                </li>
                {#if i === 0}
                    <li class="versus" aria-hidden="true">VS</li>
                {/if}
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
        /* Two contestants either side of a "VS" divider — a showdown, not a
           field, so the layout should read as a match-up rather than a grid. */
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 0.5rem 1rem;
    }
    .finalist {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.15rem;
        min-width: 0;
    }
    .finalist img {
        /* Only two portraits now, so they can run much larger than the old
           eight-up grid while still fitting the modal body's 70vh cap. */
        height: clamp(120px, 22vh, 220px);
        width: 100%;
        object-fit: contain;
        margin-bottom: 0.25rem;
    }
    .versus {
        font-size: 1.1rem;
        font-weight: bold;
        color: var(--color-text-secondary);
        padding: 0 0.25rem;
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
       a fair proxy for how much room the pair has to shrink into. */
    @media (max-width: 560px) {
        .finalist img {
            height: clamp(90px, 18vh, 160px);
        }
        .versus {
            font-size: 0.95rem;
        }
    }
</style>
