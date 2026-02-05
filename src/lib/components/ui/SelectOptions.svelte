<script lang="ts">
    /**
     * SelectOptions.svelte
     *
     * Shared dropdown list rendering used by both Select and SearchableSelect.
     * Renders a <ul> of options with highlighting, selection marks,
     * and mouse-move guard integration via the controller.
     */
    import type {
        SelectController,
        SelectOption,
    } from "$lib/SelectController.svelte";

    let { controller, options, value, formatLabel } = $props<{
        controller: SelectController<any>;
        options: SelectOption<any>[];
        value: any;
        formatLabel?: (label: string) => string;
    }>();

    function getLabel(opt: SelectOption<any>): string {
        return formatLabel ? formatLabel(opt.label) : opt.label;
    }

    function handleItemMouseDown(e: MouseEvent, opt: SelectOption<any>) {
        e.preventDefault();
        controller.selectOption(opt);
    }
</script>

<ul
    bind:this={controller.listEl}
    class="select-options-list"
    role="listbox"
    onmousemove={controller.handleMouseMove}
    onmouseleave={controller.handleMouseLeave}
>
    {#each options as opt, i (i)}
        <li role="option" aria-selected={opt.value === value}>
            <button
                type="button"
                class:highlighted={i === controller.highlightedIndex}
                class:selected={opt.value === value}
                class:disabled={opt.disabled}
                disabled={opt.disabled}
                onmousedown={(e) => handleItemMouseDown(e, opt)}
            >
                {getLabel(opt)}
                {#if opt.disabled}
                    <span class="disabled-badge">(Locked)</span>
                {/if}
            </button>
        </li>
    {:else}
        <li class="no-results">No options available</li>
    {/each}
</ul>

<style>
    .select-options-list {
        overflow-y: auto;
        flex-grow: 1;
    }

    .no-results {
        padding: 1rem;
        color: var(--color-text-secondary);
        text-align: center;
        font-size: 0.9rem;
    }

    .disabled-badge {
        font-size: 0.8em;
        opacity: 0.6;
        margin-left: 0.25rem;
    }
</style>
