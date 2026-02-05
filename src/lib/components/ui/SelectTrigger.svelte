<script lang="ts">
    /**
     * SelectTrigger.svelte
     *
     * The shared trigger button for Select and SearchableSelect.
     * Renders a styled button that shows the current label and a chevron arrow.
     *
     * Does NOT accept an `id` prop — this prevents external <label for="...">
     * elements from inadvertently opening the dropdown on click.
     */
    import type { SelectController } from "$lib/SelectController.svelte";

    let {
        controller,
        label,
        isPlaceholder = false,
    } = $props<{
        controller: SelectController<any>;
        label: string;
        isPlaceholder?: boolean;
    }>();
</script>

<button
    bind:this={controller.triggerEl}
    class="form-input select-trigger"
    onclick={() => controller.toggle()}
    onkeydown={controller.handleKeydown}
    type="button"
    aria-haspopup="listbox"
    aria-expanded={controller.isOpen}
>
    <span class="select-trigger-label" class:placeholder={isPlaceholder}>
        {label}
    </span>
    <span class="select-trigger-arrow" class:open={controller.isOpen}>▼</span>
</button>

<style>
    .select-trigger {
        display: flex;
        justify-content: space-between;
        align-items: center;
        text-align: left;
        cursor: pointer;
        width: 100%;
    }

    .select-trigger-label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-grow: 1;
    }

    .select-trigger-label.placeholder {
        color: var(--color-text-secondary);
        font-style: italic;
    }

    .select-trigger-arrow {
        font-size: 0.7rem;
        margin-left: 0.5rem;
        opacity: 0.7;
        transition: transform 0.15s ease;
    }

    .select-trigger-arrow.open {
        transform: rotate(180deg);
    }
</style>
