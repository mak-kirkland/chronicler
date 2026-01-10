<script lang="ts">
    import type { EditorField } from "$lib/infobox";
    import Icon from "./Icon.svelte";
    import SmartInput, { type SmartInputContext } from "./SmartInput.svelte";
    import SearchableSelect from "./SearchableSelect.svelte";

    let {
        field = $bindable(),
        isFirst,
        isLast,
        onMove,
        onDelete,
        handleSearch,
        handleContext, // Passed down from parent
    } = $props<{
        field: EditorField;
        isFirst: boolean;
        isLast: boolean;
        onMove: (dir: -1 | 1) => void;
        onDelete: () => void;
        handleSearch: (q: string, t: "link" | "tag" | "image") => string[];
        handleContext: (text: string) => SmartInputContext | null;
    }>();

    // Field Type Options for the SearchableSelect
    const typeOptions = ["text", "link", "spoiler", "multiline", "list"];
</script>

<div class="field-card">
    <div class="field-drag-handle">
        <button class="move-btn" onclick={() => onMove(-1)} disabled={isFirst}
            >▲</button
        >
        <button class="move-btn" onclick={() => onMove(1)} disabled={isLast}
            >▼</button
        >
    </div>

    <div class="field-main">
        <div class="field-row-top">
            <input
                type="text"
                class="key-input"
                bind:value={field.key}
                placeholder="Field Name"
                aria-label="Field Name"
            />

            <div style="width: 120px;">
                <SearchableSelect
                    options={typeOptions}
                    bind:value={field.type}
                    placeholder="Type"
                    formatLabel={(s) => s.charAt(0).toUpperCase() + s.slice(1)}
                />
            </div>

            <button class="delete-btn" onclick={onDelete} title="Remove Field">
                <Icon type="close" />
            </button>
        </div>

        <div class="field-value-row">
            {#if field.type === "multiline"}
                <SmartInput
                    type="multiline"
                    bind:value={field.value}
                    placeholder="Value..."
                    onSearch={handleSearch}
                    getContext={handleContext}
                />
            {:else if field.type === "list"}
                <input
                    type="text"
                    class="value-input"
                    value={field.value}
                    oninput={(e) =>
                        (field.value = e.currentTarget.value.split(","))}
                    placeholder="Item 1, Item 2..."
                />
            {:else if field.type === "link"}
                <SmartInput
                    type="link"
                    bind:value={field.value}
                    placeholder="Page Name"
                    onSearch={handleSearch}
                    getContext={handleContext}
                />
            {:else}
                <SmartInput
                    type="text"
                    bind:value={field.value}
                    placeholder="Value..."
                    onSearch={handleSearch}
                    getContext={handleContext}
                />
            {/if}
        </div>
    </div>
</div>

<style>
    .field-card {
        display: flex;
        background: var(--color-background-tertiary);
        border: 1px solid var(--color-border-primary);
        border-radius: 8px;
        margin-bottom: 0.75rem;
        overflow: hidden;
    }
    .field-drag-handle {
        background: var(--color-background-secondary);
        border-right: 1px solid var(--color-border-primary);
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 0.25rem;
    }
    .move-btn {
        background: none;
        border: none;
        font-size: 0.7rem;
        padding: 0.25rem;
        cursor: pointer;
        color: var(--color-text-secondary);
        opacity: 0.6;
    }
    .move-btn:hover:not(:disabled) {
        opacity: 1;
        color: var(--color-text-primary);
    }
    .move-btn:disabled {
        opacity: 0.2;
        cursor: default;
    }
    .field-main {
        flex-grow: 1;
        padding: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 0;
    }
    .field-row-top {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }
    .key-input {
        flex: 1;
        background: transparent;
        border: none;
        border-bottom: 1px dashed var(--color-border-primary);
        font-weight: bold;
        color: var(--color-text-primary);
        padding: 0.25rem;
        min-width: 0;
    }
    .key-input:focus {
        outline: none;
        border-bottom-style: solid;
        border-bottom-color: var(--color-accent-primary);
    }
    .delete-btn {
        background: none;
        border: none;
        color: var(--color-text-secondary);
        cursor: pointer;
        padding: 0.25rem;
    }
    .delete-btn:hover {
        color: var(--color-error);
    }
    .value-input {
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-primary);
        color: var(--color-text-primary);
        padding: 0.6rem;
        border-radius: 6px;
        font-size: 0.95rem;
        width: 100%;
        box-sizing: border-box;
    }
    .value-input:focus {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: -1px;
    }
</style>
