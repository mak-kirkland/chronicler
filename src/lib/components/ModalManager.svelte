<script lang="ts">
    import { activeModal } from "$lib/modalStore";

    /**
     * This component acts as the single "listener" for the modal system.
     * It is placed once in the root layout (`+layout.svelte`) and its only job
     * is to watch the `$activeModal` store and dynamically render the correct
     * modal component when the store's value is not null.
     */

    const ActiveComponent = $derived($activeModal?.component);
    const props = $derived($activeModal?.props);
</script>

<!--
  This manager acts as a dynamic renderer inside a wrapper. The specific modal
  (e.g., `SettingsModal`) is rendered *inside* this `ModalManager` component.

  In Svelte 5, if a variable holds a component constructor (like ActiveComponent does),
  you can use it directly as a tag.

  When `ActiveComponent` is not null/undefined, this block renders that component
  and spreads the `props` object onto it, passing all the necessary data down.
-->
{#if ActiveComponent}
    <ActiveComponent {...props} />
{/if}
