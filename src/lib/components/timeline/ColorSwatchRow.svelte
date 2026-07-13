<script lang="ts">
    import { PRESET_COLORS } from "$lib/canvasColors";
    import { t } from "$lib/i18n";

    let { value = null, onChange } = $props<{
        value?: string | null;
        onChange: (color: string | null) => void;
    }>();

    /* Timeline colors are stored as raw CSS (the chip renders them
       directly), so resolve the shared canvas palette to its hex values. */
    const NAMES = ["red", "orange", "yellow", "green", "cyan", "purple"];
    const swatches = Object.values(PRESET_COLORS).map((css, i) => ({
        css,
        name: NAMES[i] ?? css,
    }));
</script>

<div class="swatch-row" role="group">
    {#each swatches as s (s.css)}
        <button
            type="button"
            class="swatch"
            class:selected={value === s.css}
            style="background:{s.css}"
            title={$t("timeline.selectColor", { name: s.name })}
            aria-label={$t("timeline.selectColor", { name: s.name })}
            onclick={() => onChange(s.css)}
        ></button>
    {/each}
    <button
        type="button"
        class="swatch none"
        class:selected={value == null}
        title={$t("timeline.noColor")}
        aria-label={$t("timeline.noColor")}
        onclick={() => onChange(null)}>⌀</button
    >
</div>

<style>
    .swatch-row {
        display: flex;
        gap: 4px;
    }
    .swatch {
        width: 20px;
        height: 20px;
        border: 1px solid var(--color-border-primary);
        border-radius: 4px;
        cursor: pointer;
        padding: 0;
        font-size: 12px;
        line-height: 1;
        color: var(--color-text-secondary);
    }
    .swatch.none {
        background: var(--color-background-primary);
    }
    .swatch.selected {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: 1px;
    }
</style>
