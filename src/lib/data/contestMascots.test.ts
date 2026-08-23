import { describe, it, expect } from "vitest";
import {
    contestMascots,
    finalMascots,
    shuffleFinalists,
    shuffleFinalMascots,
} from "./contestMascots";

/** Deterministic rng cycling through fixed values, for predictable shuffles. */
function seededRng(values: number[]): () => number {
    let i = 0;
    return () => values[i++ % values.length];
}

describe("shuffleFinalists", () => {
    it("returns every finalist exactly once", () => {
        const shuffled = shuffleFinalists(seededRng([0.1, 0.7, 0.3, 0.9]));
        expect(shuffled).toHaveLength(contestMascots.length);
        expect(shuffled.map((m) => m.slug).sort()).toEqual(
            contestMascots.map((m) => m.slug).sort(),
        );
    });

    it("leaves the source list untouched", () => {
        const before = contestMascots.map((m) => m.slug);
        shuffleFinalists(seededRng([0.5]));
        expect(contestMascots.map((m) => m.slug)).toEqual(before);
    });

    it("reorders the list rather than returning it as-is", () => {
        // rng always picking the lowest index reverses a Fisher-Yates walk,
        // so this is a real permutation, not the identity.
        const shuffled = shuffleFinalists(() => 0);
        expect(shuffled.map((m) => m.slug)).not.toEqual(
            contestMascots.map((m) => m.slug),
        );
    });
});

describe("finalMascots", () => {
    it("is exactly Birdie Evolved and the Librarian", () => {
        expect(finalMascots.map((m) => m.slug).sort()).toEqual([
            "birdie-evolved",
            "librarian",
        ]);
    });
});

describe("shuffleFinalMascots", () => {
    it("returns both finalists exactly once", () => {
        const shuffled = shuffleFinalMascots(seededRng([0.1, 0.7]));
        expect(shuffled).toHaveLength(finalMascots.length);
        expect(shuffled.map((m) => m.slug).sort()).toEqual(
            finalMascots.map((m) => m.slug).sort(),
        );
    });

    it("leaves the source list untouched", () => {
        const before = finalMascots.map((m) => m.slug);
        shuffleFinalMascots(seededRng([0.5]));
        expect(finalMascots.map((m) => m.slug)).toEqual(before);
    });

    it("reorders the pair rather than returning it as-is", () => {
        const shuffled = shuffleFinalMascots(() => 0);
        expect(shuffled.map((m) => m.slug)).not.toEqual(
            finalMascots.map((m) => m.slug),
        );
    });
});
