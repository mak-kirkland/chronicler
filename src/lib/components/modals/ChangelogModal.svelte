<script lang="ts">
    import { onMount } from "svelte";
    import { renderMarkdown } from "$lib/commands";
    import { readBundledResource } from "$lib/utils";
    import Modal from "$lib/components/modals/Modal.svelte";
    import Preview from "$lib/components/views/Preview.svelte";
    import ErrorBox from "$lib/components/ui/ErrorBox.svelte";
    import type { RenderedPage } from "$lib/bindings";

    let { onClose } = $props<{ onClose: () => void }>();

    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let renderedData = $state<RenderedPage | null>(null);

    onMount(async () => {
        try {
            // Read the content directly from the bundled resource identifier.
            const markdownContent = await readBundledResource("CHANGELOG.md");
            renderedData = await renderMarkdown(markdownContent);
        } catch (e: any) {
            console.error("Failed to load changelog content:", e);
            error = `Could not load changelog file: ${e.message}`;
        } finally {
            isLoading = false;
        }
    });
</script>

<Modal title="Changelog" {onClose}>
    <div class="content-wrapper">
        {#if isLoading}
            <p>Loading changelog...</p>
        {:else if error}
            <ErrorBox>{error}</ErrorBox>
        {:else if renderedData}
            <Preview {renderedData} />
        {/if}
    </div>
</Modal>

<style>
    .content-wrapper {
        max-height: 70vh;
        overflow-y: auto;
        padding-right: 1rem;
    }
</style>
