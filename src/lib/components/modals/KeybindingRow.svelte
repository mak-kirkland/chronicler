<script lang="ts">
    /**
     * One row in the Keyboard Shortcuts modal. Purely presentational — the
     * recording state machine lives in the parent (KeybindingsModal), which
     * owns the single window capture listener. This row just renders chips and
     * emits "start recording" / "reset" intents.
     */
    import { formatCombo } from "$lib/keybindingUtils";
    import type { BindingDef } from "$lib/keybindingRegistry";

    let {
        def,
        keys,
        isRecording = false,
        isOverridden = false,
        conflict = null,
        warn = null,
        onStartRecord = (_id: string) => {},
        onReset = (_id: string) => {},
    } = $props<{
        def: BindingDef;
        keys: string[];
        isRecording?: boolean;
        isOverridden?: boolean;
        conflict?: string | null;
        warn?: string | null;
        onStartRecord?: (id: string) => void;
        onReset?: (id: string) => void;
    }>();
</script>

<div class="kb-row">
    <div class="kb-label">
        <span class="kb-name">{def.label}</span>
        {#if def.description}
            <span class="kb-desc">{def.description}</span>
        {/if}
        {#if def.note}
            <span class="kb-note">{def.note}</span>
        {/if}
        {#if warn && !isRecording}
            <span class="kb-warn">⚠ {warn}</span>
        {/if}
    </div>

    <div class="kb-keys">
        {#if isRecording}
            <span class="chip recording">Press keys…</span>
            <span class="kb-hint">Esc cancels</span>
            {#if conflict}
                <span class="kb-conflict">{conflict}</span>
            {/if}
        {:else if def.editable}
            {#if keys.length === 0}
                <button
                    class="chip editable empty"
                    onclick={() => onStartRecord(def.id)}
                    title="Click to set a shortcut"
                >
                    Not set
                </button>
            {:else}
                {#each keys as combo}
                    <button
                        class="chip editable"
                        onclick={() => onStartRecord(def.id)}
                        title="Click to rebind"
                    >
                        {formatCombo(combo)}
                    </button>
                {/each}
            {/if}
            {#if isOverridden}
                <button
                    class="kb-reset"
                    onclick={() => onReset(def.id)}
                    title="Reset to default"
                    aria-label="Reset to default">↺</button
                >
            {/if}
        {:else}
            {#each keys as combo}
                <span class="chip readonly">{formatCombo(combo)}</span>
            {/each}
        {/if}
    </div>
</div>

<style>
    .kb-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.4rem 0;
        min-height: 2rem;
    }
    .kb-label {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        padding-top: 0.2rem;
    }
    .kb-name {
        font-size: 0.95rem;
        color: var(--color-text-primary);
    }
    .kb-desc,
    .kb-note {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
    }
    .kb-warn {
        font-size: 0.8rem;
        color: var(--color-accent-warning, #c98a00);
    }
    .kb-keys {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-wrap: wrap;
        justify-content: flex-end;
    }
    .chip {
        font-family: monospace;
        font-size: 0.85rem;
        padding: 0.15rem 0.5rem;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background: var(--color-background-secondary);
        color: var(--color-text-primary);
        white-space: nowrap;
    }
    button.chip.editable {
        cursor: pointer;
    }
    button.chip.editable:hover {
        border-color: var(--color-accent-primary);
        color: var(--color-accent-primary);
    }
    .chip.empty {
        font-style: italic;
        color: var(--color-text-secondary);
    }
    .chip.readonly {
        border-style: dashed;
        opacity: 0.7;
    }
    .chip.recording {
        border-color: var(--color-accent-warning, #c98a00);
        color: var(--color-accent-warning, #c98a00);
        background: transparent;
    }
    .kb-hint {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
    }
    .kb-conflict {
        font-size: 0.8rem;
        color: var(--color-accent-danger, #d04545);
    }
    .kb-reset {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-text-secondary);
        font-size: 1rem;
        line-height: 1;
        padding: 0.1rem 0.25rem;
        border-radius: 4px;
    }
    .kb-reset:hover {
        color: var(--color-text-primary);
        background: var(--color-background-secondary);
    }
</style>
