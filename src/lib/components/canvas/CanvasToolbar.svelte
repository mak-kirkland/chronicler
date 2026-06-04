<script lang="ts">
    import Icon from "$lib/components/ui/Icon.svelte";
    import type { IconType } from "$lib/icons";
    import { t } from "$lib/i18n";

    type Tool = "select" | "text" | "image" | "embed" | "connect";

    let { tool = $bindable(), onUndo, onRedo, canUndo = true, canRedo = true } = $props<{
        tool: Tool;
        onUndo: () => void;
        onRedo: () => void;
        canUndo?: boolean;
        canRedo?: boolean;
    }>();

    // Titles are i18n keys, resolved in the template so they stay reactive
    // to language changes.
    const tools: { id: Tool; icon: IconType; titleKey: string }[] = [
        { id: "select", icon: "select", titleKey: "canvas.toolSelect" },
        { id: "text", icon: "textCard", titleKey: "canvas.toolText" },
        { id: "image", icon: "image", titleKey: "canvas.toolImage" },
        { id: "embed", icon: "file", titleKey: "canvas.embedNote" },
        { id: "connect", icon: "connect", titleKey: "canvas.toolConnect" },
    ];
</script>

<div class="dock">
    {#each tools as entry (entry.id)}
        <button
            class="tool"
            class:active={tool === entry.id}
            title={$t(entry.titleKey)}
            aria-label={$t(entry.titleKey)}
            aria-pressed={tool === entry.id}
            onclick={() => (tool = entry.id)}
        >
            <Icon type={entry.icon} />
        </button>
    {/each}
    <div class="divider"></div>
    <button class="tool" title={$t("canvas.undo")} aria-label={$t("canvas.undo")} disabled={!canUndo} onclick={onUndo}>
        <Icon type="undo" />
    </button>
    <button class="tool" title={$t("canvas.redo")} aria-label={$t("canvas.redo")} disabled={!canRedo} onclick={onRedo}>
        <Icon type="redo" />
    </button>
</div>

<style>
    .dock {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 5;
        display: flex;
        flex-direction: column;
        gap: 4px;
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: 12px;
        padding: 6px;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
    }
    .tool {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--color-text-secondary);
        cursor: pointer;
        /* Icon.svelte sizes itself in em — this yields ~18px icons. */
        font-size: 15px;
    }
    .tool:hover:not(:disabled) {
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
    }
    .tool.active {
        background: var(--color-accent-primary);
        color: #fff;
    }
    .tool:disabled {
        opacity: 0.35;
        cursor: default;
    }
    .divider {
        height: 1px;
        background: var(--color-border-primary);
        margin: 2px 0;
    }
</style>
