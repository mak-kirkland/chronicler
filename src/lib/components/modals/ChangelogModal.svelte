<script lang="ts">
    import { onMount } from "svelte";
    import { renderMarkdown } from "$lib/commands";
    import { readBundledResource } from "$lib/utils";
    import { log } from "$lib/logger";
    import Modal from "$lib/components/modals/Modal.svelte";
    import Preview from "$lib/components/views/Preview.svelte";
    import ErrorBox from "$lib/components/ui/ErrorBox.svelte";
    import type { RenderedPage } from "$lib/bindings";
    import { t } from "$lib/i18n";

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
            log.error("Failed to load changelog content", e, "ChangelogModal");
            error = $t("changelog.loadFailed", { error: e.message });
        } finally {
            isLoading = false;
        }
    });
</script>

<Modal title={$t("changelog.title")} {onClose}>
    {#if isLoading}
        <p>{$t("changelog.loading")}</p>
    {:else if error}
        <ErrorBox>{error}</ErrorBox>
    {:else if renderedData}
        <Preview {renderedData} />
    {/if}
</Modal>
