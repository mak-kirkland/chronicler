<script lang="ts">
    /**
     * Select.svelte
     *
     * A custom dropdown that replaces the native <select>.
     * Uses SelectController for all state/logic, SelectTrigger for the button,
     * and SelectOptions for the list.
     *
     * Usage:
     *   <Select
     *       options={[
     *           { value: "dark", label: "Dark Theme" },
     *           { value: "light", label: "Light Theme" },
     *       ]}
     *       bind:value={selectedTheme}
     *   />
     */
    import FloatingMenu from "$lib/components/ui/FloatingMenu.svelte";
    import SelectTrigger from "$lib/components/ui/SelectTrigger.svelte";
    import SelectOptions from "$lib/components/ui/SelectOptions.svelte";
    import {
        createSelectContext,
        type SelectOption,
    } from "$lib/SelectController.svelte";

    interface SelectGroup {
        label: string;
        options: SelectOption<string>[];
    }

    let {
        options = [],
        groups = undefined,
        value = $bindable(),
        placeholder = "Select...",
        formatLabel = undefined,
        onSelect = undefined,
    } = $props<{
        options?: SelectOption<string>[];
        groups?: SelectGroup[];
        value: string | undefined;
        placeholder?: string;
        formatLabel?: (label: string) => string;
        onSelect?: (value: string) => void;
    }>();

    // Flatten groups into a single list when groups are provided
    const flatOptions: SelectOption<string>[] = $derived(
        groups ? groups.flatMap((g: SelectGroup) => g.options) : options,
    );

    const ctrl = createSelectContext<string>({
        onSelect: (val: string) => {
            value = val;
            onSelect?.(val);
        },
        getOptions: () => flatOptions,
        getValue: () => value,
    });

    // Display label for the trigger
    const displayLabel = $derived.by(() => {
        const match = flatOptions.find(
            (o: SelectOption<string>) => o.value === value,
        );
        if (!match) return placeholder;
        return formatLabel ? formatLabel(match.label) : match.label;
    });

    const isPlaceholder = $derived(
        !flatOptions.some((o: SelectOption<string>) => o.value === value),
    );
</script>

<div class="select-wrapper">
    <SelectTrigger controller={ctrl} label={displayLabel} {isPlaceholder} />

    <FloatingMenu
        isOpen={ctrl.isOpen}
        anchorEl={ctrl.triggerEl}
        onClose={() => ctrl.close()}
        style="max-height: 250px; display: flex; flex-direction: column; overflow: hidden;"
        bind:menuEl={ctrl.menuEl}
    >
        <SelectOptions
            controller={ctrl}
            options={flatOptions}
            {value}
            {formatLabel}
        />
    </FloatingMenu>
</div>

<style>
    .select-wrapper {
        position: relative;
        width: 100%;
    }
</style>
