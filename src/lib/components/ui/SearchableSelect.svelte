<script lang="ts">
    /**
     * SearchableSelect.svelte
     *
     * A dropdown with a search/filter input. Shares all core logic with Select.svelte
     * via SelectController and renders the list with SelectOptions.
     *
     * For convenience, options can be plain strings — they'll be
     * auto-converted to SelectOption objects internally.
     */
    import { autofocus } from "$lib/domActions";
    import FloatingMenu from "$lib/components/ui/FloatingMenu.svelte";
    import SelectTrigger from "$lib/components/ui/SelectTrigger.svelte";
    import SelectOptions from "$lib/components/ui/SelectOptions.svelte";
    import {
        createSelectContext,
        type SelectOption,
    } from "$lib/SelectController.svelte";

    let {
        options = [],
        value = $bindable(),
        placeholder = "Search...",
        formatLabel = (s: string) => s,
        onSelect = undefined,
    } = $props<{
        options: string[] | SelectOption<string>[];
        value: string;
        placeholder?: string;
        formatLabel?: (s: string) => string;
        onSelect?: (value: string) => void;
    }>();

    let searchQuery = $state("");

    // Normalize: accept string[] or SelectOption[]
    const normalizedOptions: SelectOption<string>[] = $derived(
        options.map((o: string | SelectOption<string>) =>
            typeof o === "string" ? { value: o, label: o } : o,
        ),
    );

    // Filter by search query
    const filteredOptions: SelectOption<string>[] = $derived(
        normalizedOptions.filter((opt) =>
            formatLabel(opt.label)
                .toLowerCase()
                .includes(searchQuery.toLowerCase()),
        ),
    );

    const ctrl = createSelectContext<string>({
        onSelect: (val) => {
            value = val;
            onSelect?.(val);
        },
        onClose: () => {
            searchQuery = "";
        },
        getOptions: () => filteredOptions,
        getValue: () => value,
    });

    // Display label for the trigger
    const displayLabel = $derived.by(() => {
        if (!value) return placeholder;
        const match = normalizedOptions.find((o) => o.value === value);
        return match ? formatLabel(match.label) : formatLabel(value);
    });

    const isPlaceholder = $derived(!value);
</script>

<div class="searchable-select-wrapper">
    <SelectTrigger controller={ctrl} label={displayLabel} {isPlaceholder} />

    <FloatingMenu
        isOpen={ctrl.isOpen}
        anchorEl={ctrl.triggerEl}
        onClose={() => ctrl.close()}
        style="max-height: 250px; display: flex; flex-direction: column; overflow: hidden;"
        bind:menuEl={ctrl.menuEl}
    >
        <input
            type="text"
            class="form-input dropdown-search"
            bind:value={searchQuery}
            placeholder="Filter..."
            use:autofocus
            onclick={(e) => e.stopPropagation()}
            onkeydown={ctrl.handleKeydown}
        />

        {#if filteredOptions.length > 0}
            <SelectOptions
                controller={ctrl}
                options={filteredOptions}
                {value}
                {formatLabel}
            />
        {:else}
            <div class="no-results">No results found</div>
        {/if}
    </FloatingMenu>
</div>

<style>
    .searchable-select-wrapper {
        position: relative;
        width: 100%;
    }

    .dropdown-search {
        border-radius: 0;
        border: none;
        border-bottom: 1px solid var(--color-border-primary);
        width: 100%;
        flex-shrink: 0;
    }

    .dropdown-search:focus {
        outline: none;
        box-shadow: none;
        border-bottom-color: var(--color-accent-primary);
    }

    .no-results {
        padding: 1rem;
        color: var(--color-text-secondary);
        text-align: center;
        font-size: 0.9rem;
    }
</style>
