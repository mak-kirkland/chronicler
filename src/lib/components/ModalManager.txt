<script lang="ts">
    import { activeModal } from "$lib/modalStore";

    /**
     * This component acts as the single "listener" for the modal system.
     * It is placed once in the root layout (`+layout.svelte`) and its only job
     * is to watch the `$activeModal` store.
     */
</script>

<!--
  If `$activeModal` is not null, it means a modal has been requested.
  We then use Svelte's special `<svelte:component>` tag to dynamically render
  the component specified in the store.

  - `this={$activeModal.component}`: Tells Svelte *which* component to render.
  - `{...$activeModal.props}`: Spreads all the properties from the store's `props`
    object and passes them down to the rendered component.

  This manager acts as a dynamic renderer inside a wrapper. The specific modal
  (e.g., `RenameModal`) is rendered *inside* this `ModalManager` component.
-->
{#if $activeModal}
    <svelte:component this={$activeModal.component} {...$activeModal.props} />
{/if}
