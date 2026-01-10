<script lang="ts">
    import type { EditorField } from "$lib/infobox";
    import Icon from "./Icon.svelte";
    import Button from "./Button.svelte";
    import SmartInput from "./SmartInput.svelte";
    import SearchableSelect from "./SearchableSelect.svelte";

    let {
        field = $bindable(),
        isFirst,
        isLast,
        onMove,
        onDelete,
        // Data injected from parent for autocompletion
        allFiles,
        allImages,
    } = $props<{
        field: EditorField;
        isFirst: boolean;
        isLast: boolean;
        onMove: (dir: -1 | 1) => void;
        onDelete: () => void;
        allFiles: string[];
        allImages: string[];
    }>();

    // Simplified options: Just Text (default) or List.
    const typeOptions = ["text", "list"];

    // Ensure value type consistency when switching modes
    $effect(() => {
        if (field.type === "list") {
            if (!Array.isArray(field.value)) {
                // Convert string to array (preserving content)
                field.value = field.value ? [field.value] : [];
            }
        } else {
            if (Array.isArray(field.value)) {
                // Convert array to string (comma separated)
                field.value = field.value.join(", ");
            }
        }
    });

    function addListItem() {
        if (Array.isArray(field.value)) {
            field.value = [...field.value, ""];
        }
    }

    function removeListItem(index: number) {
        if (Array.isArray(field.value)) {
            field.value.splice(index, 1);
            // Re-assign to trigger reactivity if needed by shallow checks
            field.value = [...field.value];
        }
    }
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

            <div style="width: 100px;">
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
            {#if field.type === "list" && Array.isArray(field.value)}
                <div class="list-editor">
                    {#each field.value as item, i}
                        <div class="list-item-row">
                            <SmartInput
                                mode="wiki"
                                bind:value={field.value[i]}
                                placeholder="List item..."
                                files={allFiles}
                                images={allImages}
                                className="list-smart-input"
                            />
                            <button
                                class="list-remove-btn"
                                onclick={() => removeListItem(i)}
                                title="Remove Item"
                            >
                                <Icon type="close" />
                            </button>
                        </div>
                    {/each}
                    <Button size="small" onclick={addListItem}
                        >+ Add Item</Button
                    >
                </div>
            {:else}
                <!--
                    Default Text Input
                    Uses 'wiki' mode to enable [[...]] autocomplete
                -->
                <SmartInput
                    mode="wiki"
                    multiline={true}
                    bind:value={field.value}
                    placeholder="Value (supports [[links]])..."
                    files={allFiles}
                    images={allImages}
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
        overflow: visible; /* Changed to visible for dropdowns */
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

    /* List Editor Styles */
    .list-editor {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .list-item-row {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }
    .list-remove-btn {
        background: none;
        border: none;
        color: var(--color-text-secondary);
        cursor: pointer;
        padding: 0.2rem;
        opacity: 0.6;
    }
    .list-remove-btn:hover {
        opacity: 1;
        color: var(--color-error);
    }
    /* Ensure smart input takes full width in list */
    :global(.list-smart-input) {
        flex-grow: 1;
    }
</style>
