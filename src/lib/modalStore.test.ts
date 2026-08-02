import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import type { Component } from "svelte";
import {
    modalStack,
    activeModal,
    modalStackDepth,
    openModal,
    popModal,
    closeModal,
} from "$lib/modalStore";

// Stand-ins for real modal components. Nothing here renders them; the store
// only ever carries them around.
const First = (() => {}) as unknown as Component<any>;
const Second = (() => {}) as unknown as Component<any>;

describe("modalStore", () => {
    beforeEach(() => closeModal());

    it("exposes every open modal, not just the topmost", () => {
        openModal({ component: First, props: {} });
        openModal({ component: Second, props: {} });

        expect(get(modalStack).map((e) => e.component)).toEqual([
            First,
            Second,
        ]);
        expect(get(activeModal)?.component).toBe(Second);
        expect(get(modalStackDepth)).toBe(2);
    });

    // The next two tests pin down the behaviour that keeps a stacked modal
    // mounted. ModalManager keys its `{#each}` on `id`, so a stable id means
    // Svelte reuses the component instance and its state survives; a changed
    // id would tear it down and rebuild it, silently discarding anything the
    // user had typed underneath.
    it("keeps the identity of a modal when another opens on top of it", () => {
        openModal({ component: First, props: {} });
        const firstId = get(modalStack)[0].id;

        openModal({ component: Second, props: {} });

        expect(get(modalStack)[0].id).toBe(firstId);
    });

    it("keeps the identity of the revealed modal when the top is popped", () => {
        openModal({ component: First, props: {} });
        const firstId = get(modalStack)[0].id;
        openModal({ component: Second, props: {} });

        popModal();

        expect(get(modalStack)).toHaveLength(1);
        expect(get(modalStack)[0].id).toBe(firstId);
        expect(get(activeModal)?.component).toBe(First);
    });

    it("gives a reopened modal a fresh identity so it does not inherit stale state", () => {
        openModal({ component: First, props: {} });
        const firstId = get(modalStack)[0].id;
        closeModal();

        openModal({ component: First, props: {} });

        expect(get(modalStack)[0].id).not.toBe(firstId);
    });

    it("clears the stack when the last modal is popped", () => {
        openModal({ component: First, props: {} });

        popModal();

        expect(get(modalStack)).toEqual([]);
        expect(get(activeModal)).toBeNull();
        expect(get(modalStackDepth)).toBe(0);
    });

    it("closes the whole stack at once", () => {
        openModal({ component: First, props: {} });
        openModal({ component: Second, props: {} });

        closeModal();

        expect(get(modalStack)).toEqual([]);
        expect(get(activeModal)).toBeNull();
    });
});
