<script lang="ts">
    import { onMount } from "svelte";
    import { renderMarkdown } from "$lib/commands";
    import { readBundledResource } from "$lib/utils";
    import Modal from "./Modal.svelte";
    import Preview from "./Preview.svelte";
    import ErrorBox from "./ErrorBox.svelte";
    import type { RenderedPage } from "$lib/bindings";
    import Button from "./Button.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";

    let { onClose } = $props<{ onClose: () => void }>();

    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let renderedData = $state<RenderedPage | null>(null);

    onMount(async () => {
        try {
            // Read the content directly from the bundled resource identifier.
            const markdownContent = await readBundledResource("HELP.md");
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
    {#if isLoading}
        <p>Loading help...</p>
    {:else if error}
        <ErrorBox>{error}</ErrorBox>
    {:else if renderedData}
        <Button
            onclick={() => openUrl("https://chronicler.pro/getting-started")}
            >Open in Browser</Button
        >
        <Preview {renderedData} />
    {/if}
</Modal>
