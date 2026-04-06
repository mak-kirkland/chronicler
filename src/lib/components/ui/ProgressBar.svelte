<script lang="ts">
    /**
     * ProgressBar.svelte
     * A themeable determinate progress bar.
     *
     * Styled with the app's global CSS variables so it stays consistent
     * with Modal, FloatingMenu, ErrorBox, etc.
     *
     * Usage:
     *   <ProgressBar value={3} max={6} label="Generating tiles…" />
     *   <ProgressBar value={75} max={100} showPercent />
     */

    let {
        /** Current progress value. */
        value,
        /** Maximum value (denominator). Defaults to 100. */
        max = 100,
        /** Optional text label shown above the bar. */
        label = "",
        /** Optional detail text shown to the right (e.g. "3/6 zoom levels"). */
        detail = "",
        /** Show a percentage number to the right of the bar. */
        showPercent = false,
        /** Bar height in px. */
        height = 6,
        /** Accent color override. Falls back to --color-accent-primary. */
        color = "",
    } = $props<{
        value: number;
        max?: number;
        label?: string;
        detail?: string;
        showPercent?: boolean;
        height?: number;
        color?: string;
    }>();

    const percent = $derived(Math.min(100, Math.max(0, (value / max) * 100)));
    const percentText = $derived(`${Math.round(percent)}%`);
</script>

<div
    class="progress-container"
    role="progressbar"
    aria-valuenow={value}
    aria-valuemin={0}
    aria-valuemax={max}
    aria-label={label || "Progress"}
>
    {#if label || detail || showPercent}
        <div class="progress-header">
            {#if label}
                <span class="progress-label">{label}</span>
            {/if}
            <span class="progress-detail">
                {#if detail}{detail}{/if}
                {#if showPercent}{percentText}{/if}
            </span>
        </div>
    {/if}

    <div class="progress-track" style="height: {height}px;">
        <div
            class="progress-fill"
            style="width: {percent}%; --bar-color: {color ||
                'var(--color-accent-primary)'};"
        />
    </div>
</div>

<style>
    .progress-container {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
        width: 100%;
    }

    .progress-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-family: var(--font-family-body);
        font-size: 0.85rem;
        color: var(--color-text-secondary);
        line-height: 1.2;
    }

    .progress-label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .progress-detail {
        flex-shrink: 0;
        margin-left: auto;
        padding-left: var(--space-sm);
        font-family: var(--font-mono);
        font-size: 0.8rem;
        font-variant-numeric: tabular-nums;
    }

    .progress-track {
        width: 100%;
        background: var(--color-overlay-medium);
        border: 1px solid var(--color-border-primary);
        border-radius: var(--radius-base);
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: var(--bar-color);
        border-radius: var(--radius-base);
        transition: width 0.35s ease;
    }
</style>
