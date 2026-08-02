<script lang="ts">
    /**
     * Renders one modal from the stack.
     *
     * Every open modal stays mounted so that going "back" returns the user to
     * the modal they left, with their in-progress edits intact. Only the
     * topmost one is visible and interactive.
     */
    import { setContext } from "svelte";
    import type { Component } from "svelte";
    import { MODAL_IS_TOP } from "$lib/modalStore";

    let { component, props, isTop } = $props<{
        component: Component<any>;
        props: Record<string, unknown>;
        isTop: boolean;
    }>();

    const Rendered = $derived(component);

    // `setContext` runs once, at init, so hand down a getter rather than the
    // value itself — the modal has to see this flip as the stack grows and
    // shrinks around it.
    setContext(MODAL_IS_TOP, {
        get current() {
            return isTop;
        },
    });
</script>

<div class="stack-entry" class:hidden={!isTop} inert={!isTop}>
    <Rendered {...props} />
</div>

<style>
    /*
     * `visibility`, not `display: none`: a hidden modal keeps its layout, so
     * scroll positions inside it survive being covered. WebKitGTK drops the
     * scrollTop of a `display: none` container where Chrome preserves it —
     * the same trap FileView works around for its preview pane.
     *
     * `visibility: hidden` also takes the modal out of the accessibility tree
     * and stops it receiving pointer events, so the covered modal can't be
     * clicked through to. `inert` above covers keyboard focus.
     */
    .stack-entry.hidden {
        visibility: hidden;
    }
</style>
