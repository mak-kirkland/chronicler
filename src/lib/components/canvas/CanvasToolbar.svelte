<script lang="ts">
    let { tool = $bindable(), onUndo, onRedo } = $props<{
        tool: "select" | "text" | "image" | "embed" | "connect";
        onUndo: () => void;
        onRedo: () => void;
    }>();

    const tools: { id: typeof tool; label: string; title: string }[] = [
        { id: "select", label: "⤢", title: "Select / pan" },
        { id: "text", label: "T", title: "Add text card (click empty space)" },
        { id: "image", label: "🖼️", title: "Add image (pick from vault)" },
        { id: "embed", label: "📄", title: "Embed a note" },
        { id: "connect", label: "↗", title: "Connect cards" },
    ];
</script>

<div class="dock">
    {#each tools as t}
        <button
            class="tool"
            class:active={tool === t.id}
            title={t.title}
            aria-label={t.title}
            onclick={() => (tool = t.id)}>{t.label}</button
        >
    {/each}
    <div class="divider"></div>
    <button class="tool" title="Undo" aria-label="Undo" onclick={onUndo}>↶</button>
    <button class="tool" title="Redo" aria-label="Redo" onclick={onRedo}>↷</button>
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
        font-size: 15px;
    }
    .tool:hover {
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
    }
    .tool.active {
        background: var(--color-accent-primary);
        color: #fff;
    }
    .divider {
        height: 1px;
        background: var(--color-border-primary);
        margin: 2px 0;
    }
</style>
