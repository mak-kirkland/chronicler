/**
 * @file Startup announcement for the community mascot-design contest.
 *
 * Shows a splash modal on launch featuring the 8 round-2 finalists and a link
 * to vote on the website. It appears on every launch (there is no dismissal) so
 * the contest stays front-of-mind while it runs. Fully offline: it makes no
 * network calls itself — the only outbound action is the user choosing to open
 * the vote page in their browser. The whole feature (this module,
 * `MascotContestModal.svelte`, `data/contestMascots.ts`, and `static/mascots/`)
 * can be removed cleanly once the contest ends.
 */

import { openModal } from "./modalStore";
import MascotContestModal from "./components/modals/MascotContestModal.svelte";
import { shuffleFinalists } from "./data/contestMascots";

/** Website page where the contest voting happens. */
export const CONTEST_VOTE_URL = "https://chronicler.pro/mascots";

/** Open the contest announcement modal, showing the finalists in random order. */
export function showContestAnnouncement(): void {
    openModal({
        component: MascotContestModal,
        props: { mascots: shuffleFinalists() },
    });
}
