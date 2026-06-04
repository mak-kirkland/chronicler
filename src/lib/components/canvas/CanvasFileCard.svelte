<script lang="ts">
    import type { CanvasFileNode } from "$lib/canvasModels";
    import { toAbsolutePath } from "$lib/canvasModels";
    import { vaultPath } from "$lib/worldStore";
    import { getImageSource, buildPageView } from "$lib/commands";
    import { navigateToPage } from "$lib/actions";
    import { isImageFile, fileStemString } from "$lib/utils";
    import { log } from "$lib/logger";

    let { node } = $props<{ node: CanvasFileNode }>();

    const abs = $derived(toAbsolutePath(node.file, $vaultPath ?? ""));
    const isImage = $derived(isImageFile(node.file));

    let imageUrl = $state("");
    let preview = $state("");
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
                const text = d.raw_content.replace(/^---[\s\S]*?---/, "").trim();
                preview = text.slice(0, 220);
            })
            .catch(() => (preview = ""));
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
        <div class="note-header" onpointerdown={(e) => e.stopPropagation()}>
            <span class="page-icon">📄</span>
            <span class="note-title">{title}</span>
            <button
                class="open-btn"
                onclick={() => navigateToPage({ title, path: abs })}
                title="Open page">↗ open</button
            >
        </div>
        <div class="note-preview">{preview}</div>
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
        object-fit: cover;
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
    .note-preview {
        padding: 8px 9px;
        overflow: auto;
        color: var(--color-text-secondary);
        line-height: 1.5;
    }
</style>
