<script lang="ts">
    import type { CanvasFileNode } from "$lib/canvasModels";
    import { toAbsolutePath } from "$lib/canvasModels";
    import { vaultPath } from "$lib/worldStore";
    import { getImageSource, buildPageView } from "$lib/commands";
    import { navigateToPage } from "$lib/actions";
    import { isImageFile, fileStemString } from "$lib/utils";
    import { hasInfoboxContent, type InfoboxFrontmatter } from "$lib/infobox";
    import PagePreviewContent from "$lib/components/ui/PagePreviewContent.svelte";
    import { log } from "$lib/logger";
    import { t } from "$lib/i18n";

    let { node } = $props<{ node: CanvasFileNode }>();

    const abs = $derived(toAbsolutePath(node.file, $vaultPath ?? ""));
    const isImage = $derived(isImageFile(node.file));

    let imageUrl = $state("");
    let infobox = $state<InfoboxFrontmatter | null>(null);
    let fallbackHtml = $state("");
    const title = $derived(fileStemString(abs));

    $effect(() => {
        if (!isImage || !abs) return;
        let cancelled = false;
        getImageSource(abs)
            .then((u) => !cancelled && (imageUrl = u))
            .catch((e) => log.error("canvas image load failed", e, "CanvasFileCard"));
        return () => (cancelled = true);
    });

    $effect(() => {
        if (isImage || !abs) return;
        let cancelled = false;
        buildPageView(abs)
            .then((d) => {
                if (cancelled) return;
                const frontmatter = d.rendered_page?.processed_frontmatter;
                if (hasInfoboxContent(frontmatter)) {
                    // Tags are hidden to keep the card compact (same as LinkPreview).
                    infobox = { ...frontmatter, tags: [] };
                    fallbackHtml = "";
                } else {
                    infobox = null;
                    fallbackHtml = (d.rendered_page?.html_before_toc ?? "").trim();
                }
            })
            .catch(() => {
                infobox = null;
                fallbackHtml = "";
            });
        return () => (cancelled = true);
    });
</script>

{#if isImage}
    <div class="image-card">
        {#if imageUrl}
            <img src={imageUrl} alt={title} draggable="false" />
        {/if}
    </div>
{:else}
    <div class="note-card">
        <!-- The header acts as a drag handle: pointer events bubble up to the
             node's drag logic. Only the open button swallows them. -->
        <div class="note-header">
            <span class="page-icon">📄</span>
            <span class="note-title">{title}</span>
            <button
                class="open-btn"
                onpointerdown={(e) => e.stopPropagation()}
                onclick={() => navigateToPage({ title, path: abs })}
                title={$t("canvas.openPage")}>↗ {$t("canvas.open")}</button
            >
        </div>
        <div class="note-body">
            <PagePreviewContent {infobox} {fallbackHtml} fallbackTitle={title} />
        </div>
    </div>
{/if}

<style>
    .image-card {
        width: 100%;
        height: 100%;
        display: flex;
    }
    .image-card img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        user-select: none;
    }
    .note-card {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        font-size: 12px;
        color: var(--color-text-primary);
    }
    .note-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 9px;
        border-bottom: 1px solid var(--color-border-primary);
        background: var(--color-background-tertiary);
        user-select: none;
    }
    .note-title {
        font-weight: 600;
    }
    .open-btn {
        margin-left: auto;
        border: none;
        background: transparent;
        color: var(--color-accent-primary);
        cursor: pointer;
        font-size: 11px;
    }
    .note-body {
        flex: 1;
        min-height: 0;
        overflow: auto;
    }
</style>
