<script lang="ts">
    import { onMount } from "svelte";
    import Modal from "./Modal.svelte";
    import Preview from "./Preview.svelte";
    import { renderMarkdown } from "$lib/commands";
    import type { RenderedPage } from "$lib/bindings";
    import ErrorBox from "./ErrorBox.svelte";

    let { onClose } = $props<{ onClose: () => void }>();

    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let renderedData = $state<RenderedPage | null>(null);

    onMount(async () => {
        try {
            const response = await fetch("/help.md");
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const markdownContent = await response.text();

            renderedData = await renderMarkdown(markdownContent);
        } catch (e: any) {
            console.error("Failed to load help content:", e);
            error = `Could not load help file: ${e.message}`;
        } finally {
            isLoading = false;
        }
    });
</script>

<Modal title="Help" {onClose}>
    <div class="help-content-wrapper">
        {#if isLoading}
            <p>Loading help...</p>
        {:else if error}
            <ErrorBox>{error}</ErrorBox>
        {:else if renderedData}
            <Preview {renderedData} />
        {/if}
    </div>
</Modal>

<style>
    .help-content-wrapper {
        max-height: 70vh;
        overflow-y: auto;
        padding-right: 1rem;
    }
</style>
