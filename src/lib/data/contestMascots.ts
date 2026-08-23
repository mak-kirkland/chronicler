/**
 * Bundled data for the community mascot-contest splash announcement.
 *
 * Round 1 narrowed 23 community designs down to these 8 finalists. Generated
 * from the chronicler-website mascots vault; this is a self-contained snapshot
 * so the app stays fully offline — it has no runtime or build dependency on the
 * website repo. Safe to delete (along with `contestAnnouncement.ts`,
 * `MascotContestModal.svelte`, and `static/mascots/`) once the contest is over.
 */

export interface ContestMascot {
    slug: string;
    name: string;
    subtitle?: string;
    creator?: string;
    /** Public path to the bundled image, e.g. "/mascots/birdie.webp". */
    image: string;
}

/** The 8 finalists, in the order round 1 left them. */
export const contestMascots: ContestMascot[] = [
    {
        slug: "birdie-evolved",
        name: "Birdie Evolved",
        subtitle: "The Fledged",
        creator: "@loreofold",
        image: "/mascots/birdie-evolved.webp",
    },
    {
        slug: "librarian",
        name: "Librarian",
        subtitle: "The Anonymous Wanderer",
        creator: "@klfni",
        image: "/mascots/librarian.webp",
    },
    {
        slug: "dragon",
        name: "Dragon",
        subtitle: "The Chronicler's Assistant",
        creator: "@draco5557",
        image: "/mascots/dragon.webp",
    },
    {
        slug: "wizard",
        name: "Wizard",
        subtitle: "The World Beneath the Hat",
        creator: "@frenchbelphegor",
        image: "/mascots/wizard.webp",
    },
    {
        slug: "brush-bird",
        name: "Brush Bird",
        subtitle: "The Painter of Worlds",
        creator: "@Daemon",
        image: "/mascots/brush-bird.webp",
    },
    {
        slug: "stoat",
        name: "Stoat",
        subtitle: "The Blank Page",
        creator: "@andromeva",
        image: "/mascots/stoat.webp",
    },
    {
        slug: "birdie",
        name: "Birdie",
        subtitle: "The First Draft",
        creator: "@amadshade",
        image: "/mascots/birdie.webp",
    },
    {
        slug: "the-inky-knight",
        name: "The Inky Knight",
        subtitle: "Knight of Planetary Creation",
        creator: "@oshashi",
        image: "/mascots/the-inky-knight.webp",
    },
];

function shuffle<T>(items: T[], rng: () => number): T[] {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Return the finalists in a fresh random order, leaving the source untouched.
 *
 * The splash shows all 8 at once, so a fixed order would hand whoever sits in
 * the top-left a permanent advantage. Reshuffling per launch spreads that
 * around. `rng` is injectable for predictability in tests.
 */
export function shuffleFinalists(
    rng: () => number = Math.random,
): ContestMascot[] {
    return shuffle(contestMascots, rng);
}

/** Round 2 narrowed the field to a showdown between these two. */
const RUNOFF_SLUGS = ["birdie-evolved", "librarian"];

/** The final two, pulled from the full field so their data stays in one place. */
export const finalMascots: ContestMascot[] = contestMascots.filter((m) =>
    RUNOFF_SLUGS.includes(m.slug),
);

/**
 * Return the final two in a fresh random order, leaving the source untouched.
 *
 * Same rationale as {@link shuffleFinalists}: don't let a fixed order favor
 * whoever lands first. `rng` is injectable for predictability in tests.
 */
export function shuffleFinalMascots(
    rng: () => number = Math.random,
): ContestMascot[] {
    return shuffle(finalMascots, rng);
}
