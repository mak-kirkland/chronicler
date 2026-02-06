<script lang="ts">
    import AutocompleteInput from "$lib/components/ui/AutocompleteInput.svelte";

    let { keys = $bindable(), allFields } = $props<{
        keys?: string[];
        allFields: string[];
    }>();

    let inputValue = $state("");

    function addKey(key: string) {
        const cleaned = key.trim();
        if (!keys) keys = [];

        // Prevent duplicates
        if (cleaned && !keys.includes(cleaned)) {
            keys = [...keys, cleaned];
        }
        // Clear input
        inputValue = "";
    }

    function removeKey(index: number) {
        if (!keys) return;
        keys.splice(index, 1);
        keys = [...keys]; // trigger reactivity
    }
</script>

<div class="tag-input-container">
    <div class="tag-list">
        {#if keys && keys.length > 0}
            {#each keys as key, i}
                <span class="tag-pill">
                    {key}
                    <button class="tag-remove" onclick={() => removeKey(i)}
                        >×</button
                    >
                </span>
            {/each}
        {/if}
    </div>
    <div class="smart-input-container">
        <AutocompleteInput
            placeholder="Add field to column..."
            options={allFields}
            bind:value={inputValue}
            onEnter={addKey}
            className="tag-input-field-wrapper"
        />
    </div>
</div>
{#if !keys || keys.length === 0}
    <small class="helper-text">Select fields to group in this row.</small>
{/if}

<style>
    .tag-input-container {
        border: 1px solid var(--color-border-primary);
        background: var(--color-background-secondary);
        border-radius: 6px;
        padding: 0.5rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .tag-list {
        display: contents;
    }
    .smart-input-container {
        flex-grow: 1;
        min-width: 120px;
    }
    :global(.tag-input-field-wrapper .form-input) {
        border: none !important;
        background: transparent !important;
        padding: 0.2rem !important;
    }
    :global(.tag-input-field-wrapper .form-input:focus) {
        outline: none !important;
    }
    .helper-text {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        margin: 0;
    }
</style>
