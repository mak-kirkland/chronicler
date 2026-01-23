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
        isDuplicateKey = false,
    } = $props<{
        field: EditorField;
        isFirst: boolean;
        isLast: boolean;
        onMove: (dir: -1 | 1) => void;
        onDelete: () => void;
        isDuplicateKey?: boolean;
    }>();

    const typeOptions = ["text", "list"];

    /**
     * Explicit handler for type changes
     */
    function handleTypeChange(newType: string) {
        if (newType === "list") {
            if (!Array.isArray(field.value)) {
                // Split comma-separated strings into a list
                const str = String(field.value || "");
                field.value = str ? str.split(",").map((s) => s.trim()) : [];
            }
        } else {
            if (Array.isArray(field.value)) {
                // Convert array to string (comma separated)
                field.value = field.value.join(", ");
            }
        }
    }

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

<!-- Using global Sortable Card Pattern classes -->
<div class="sortable-card" class:has-error={isDuplicateKey}>
    <div class="sortable-handle">
        <button class="icon-btn" onclick={() => onMove(-1)} disabled={isFirst}
            >▲</button
        >
        <button class="icon-btn" onclick={() => onMove(1)} disabled={isLast}
            >▼</button
        >
    </div>

    <div class="sortable-content">
        <div class="field-row-top">
            <div class="key-input-wrapper">
                <input
                    type="text"
                    class="key-input"
                    class:input-error={isDuplicateKey}
                    bind:value={field.key}
                    placeholder="Field Name"
                    aria-label="Field Name"
                />
                {#if isDuplicateKey}
                    <span class="error-text">Duplicate Key</span>
                {/if}
            </div>

            <div style="width: 100px;">
                <SearchableSelect
                    options={typeOptions}
                    bind:value={field.type}
                    onSelect={handleTypeChange}
                    placeholder="Type"
                    formatLabel={(s) => s.charAt(0).toUpperCase() + s.slice(1)}
                />
            </div>

            <button
                class="icon-btn danger"
                onclick={onDelete}
                title="Remove Field"
            >
                <Icon type="close" />
            </button>
        </div>

        <div class="field-value-row">
            {#if field.type === "list" && Array.isArray(field.value)}
                <div class="list-editor">
                    {#each field.value as _, i}
                        <div class="list-item-row">
                            <SmartInput
                                multiline={true}
                                bind:value={field.value[i]}
                                placeholder="Value (supports [[links]])..."
                            />
                            <button
                                class="icon-btn danger"
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
                    SmartInput for prose/text blocks.
                    Allows long-form writing with trigger-based wiki-links ([[...]]).
                -->
                <SmartInput
                    multiline={true}
                    bind:value={field.value}
                    placeholder="Value (supports [[links]])..."
                />
            {/if}
        </div>
    </div>
</div>

<style>
    .field-row-top {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start; /* Align top so error message doesn't shift other controls */
    }

    .key-input-wrapper {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .key-input {
        background: transparent;
        border: none;
        border-bottom: 1px dashed var(--color-border-primary);
        font-weight: bold;
        color: var(--color-text-primary);
        padding: 0.25rem;
        width: 100%;
        box-sizing: border-box;
    }
    .key-input:focus {
        outline: none;
        border-bottom-style: solid;
        border-bottom-color: var(--color-accent-primary);
    }

    .key-input.input-error {
        border-bottom-color: var(--color-text-error);
        color: var(--color-text-error);
    }

    .error-text {
        font-size: 0.75rem;
        color: var(--color-text-error);
        margin-top: 0.1rem;
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

    :global(.list-smart-input) {
        flex-grow: 1;
    }
</style>
