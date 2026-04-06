<script lang="ts">
    /**
     * ProgressBar.svelte
     * A reusable, themeable progress bar component.
     *
     * Supports determinate (value/max) and indeterminate (value omitted) modes.
     * Styled using the app's global CSS variables for consistency with other
     * UI components (Modal, FloatingMenu, ErrorBox, etc.).
     *
     * Usage:
     *   <ProgressBar value={3} max={6} label="Generating tiles…" />
     *   <ProgressBar label="Loading…" />               <!-- indeterminate -->
     *   <ProgressBar value={75} max={100} showPercent /> <!-- with % text  -->
     */

    let {
        /** Current progress value. Omit for indeterminate mode. */
        value = undefined,
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
        value?: number;
        max?: number;
        label?: string;
        detail?: string;
        showPercent?: boolean;
        height?: number;
        color?: string;
    }>();

    const indeterminate = $derived(value === undefined || value === null);
    const percent = $derived(
        indeterminate
            ? 0
            : Math.min(100, Math.max(0, ((value ?? 0) / max) * 100)),
    );
    const percentText = $derived(`${Math.round(percent)}%`);
</script>

<div
    class="progress-container"
    role="progressbar"
    aria-valuenow={indeterminate ? undefined : value}
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
                {#if showPercent && !indeterminate}{percentText}{/if}
            </span>
        </div>
    {/if}

    <div class="progress-track" style="height: {height}px;">
        {#if indeterminate}
            <div
                class="progress-fill indeterminate"
                style="--bar-color: {color || 'var(--color-accent-primary)'};"
            />
        {:else}
            <div
                class="progress-fill"
                style="width: {percent}%; --bar-color: {color ||
                    'var(--color-accent-primary)'};"
            />
        {/if}
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

    /* Indeterminate shimmer */
    .progress-fill.indeterminate {
        width: 35%;
        animation: indeterminate 1.4s ease-in-out infinite;
    }

    @keyframes indeterminate {
        0% {
            transform: translateX(-100%);
        }
        100% {
            transform: translateX(380%);
        }
    }
</style>
