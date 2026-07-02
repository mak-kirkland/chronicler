<script lang="ts">
    import { onMount } from "svelte";
    import { renderMarkdown } from "$lib/commands";
    import { readBundledResource } from "$lib/utils";
    import Modal from "$lib/components/modals/Modal.svelte";
    import Preview from "$lib/components/views/Preview.svelte";
    import ErrorBox from "$lib/components/ui/ErrorBox.svelte";
    import type { RenderedPage } from "$lib/bindings";
    import Button from "$lib/components/ui/Button.svelte";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { handleContentClick } from "$lib/actions";
    import { log } from "$lib/logger";
    import { t } from "$lib/i18n";

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
            log.error("Failed to load help content", e, "HelpModal");
            error = $t("help.loadFailed", { error: e.message });
        } finally {
            isLoading = false;
        }
    });
</script>

<Modal title={$t("help.title")} {onClose}>
    {#if isLoading}
        <p>{$t("help.loading")}</p>
    {:else if error}
        <ErrorBox>{error}</ErrorBox>
    {:else if renderedData}
        <Button
            onclick={() => openUrl("https://chronicler.pro/getting-started")}
            >{$t("help.openInBrowser")}</Button
        >
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div onclick={handleContentClick} onkeydown={handleContentClick}>
            <Preview {renderedData} />
        </div>
    {/if}
</Modal>
