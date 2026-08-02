<script lang="ts">
    import { modalStack } from "$lib/modalStore";
    import ModalStackEntry from "./ModalStackEntry.svelte";

    /**
     * This component acts as the single "listener" for the modal system.
     * It is placed once in the root layout (`+layout.svelte`) and its only job
     * is to watch the modal stack and render it.
     *
     * The whole stack is rendered, not just the topmost modal, and
     * `ModalStackEntry` hides all but the last. Rendering only the top would
     * unmount the modal underneath, so opening a nested modal and coming back
     * would rebuild it from its original props and throw away whatever the
     * user had typed — which is exactly what the back button promises not to
     * do.
     *
     * The `{#each}` is keyed on `entry.id` so that entries which stay on the
     * stack keep their component instance. Stack order is also DOM order, so
     * the visible modal is painted last and sits above the rest.
     */
</script>

{#each $modalStack as entry, i (entry.id)}
    <ModalStackEntry
        component={entry.component}
        props={entry.props}
        isTop={i === $modalStack.length - 1}
    />
{/each}
