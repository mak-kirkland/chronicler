<script lang="ts">
    import type { EditorField } from "$lib/infobox";
    import InfoboxFieldRow from "$lib/components/infobox/InfoboxFieldRow.svelte";
    import AutocompleteInput from "$lib/components/ui/AutocompleteInput.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import { tags as worldTags } from "$lib/worldStore";

    let {
        title = $bindable(),
        subtitle = $bindable(),
        tags = $bindable(),
        customFields = $bindable(),
        duplicateKeys,
        onAddField,
    } = $props<{
        title: string;
        subtitle: string;
        tags: string[];
        customFields: EditorField[];
        duplicateKeys: Set<string>;
        onAddField: () => void;
    }>();

    let tagInputValue = $state("");

    function addTag(tagToAdd: string) {
        const cleaned = tagToAdd.trim();
        if (cleaned && !tags.includes(cleaned)) {
            tags = [...tags, cleaned];
        }
    }

    function handleTagEnter(val: string) {
        addTag(val);
        tagInputValue = ""; // Clear input after adding
    }

    function removeTag(tag: string) {
        tags = tags.filter((t: string) => t !== tag);
    }

    function removeField(index: number) {
        customFields = customFields.filter((_: any, i: number) => i !== index);
    }

    function handleMove(index: number, direction: number) {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= customFields.length) return;
        customFields = customFields
            .with(index, customFields[targetIndex])
            .with(targetIndex, customFields[index]);
    }
</script>

<div class="form-section">
    <div class="form-group">
        <label for="field-title">Title</label>
        <input
            id="field-title"
            type="text"
            bind:value={title}
            placeholder="Page Title"
            class="form-input"
        />
    </div>
    <div class="form-group">
        <label for="field-subtitle">Subtitle (Optional)</label>
        <input
            id="field-subtitle"
            type="text"
            bind:value={subtitle}
            placeholder="Subtitle"
            class="form-input"
        />
    </div>

    <!-- Tag Manager -->
    <div class="form-group">
        <label for="field-tags">Tags</label>
        <div class="tag-input-container">
            <div class="tag-list">
                {#each tags as tag}
                    <span class="tag-pill"
                        >#{tag}
                        <button
                            class="tag-remove"
                            onclick={() => removeTag(tag)}>×</button
                        ></span
                    >
                {/each}
            </div>
            <div class="smart-input-container">
                <AutocompleteInput
                    placeholder="Add tag..."
                    options={$worldTags.map((t) => t[0])}
                    onEnter={handleTagEnter}
                    bind:value={tagInputValue}
                    className="tag-input-field-wrapper"
                />
            </div>
        </div>
        <small class="helper-text"
            >Enter to select, Shift+Enter to create new.</small
        >
    </div>

    <div class="separator-line"></div>

    <!-- Custom Fields -->
    <div class="custom-fields-header">
        <h4>Custom Fields</h4>
        <Button size="small" onclick={onAddField}>+ Add Field</Button>
    </div>

    <div class="fields-list">
        {#each customFields as field, i (field.id)}
            <InfoboxFieldRow
                bind:field={customFields[i]}
                isFirst={i === 0}
                isLast={i === customFields.length - 1}
                onMove={(dir) => handleMove(i, dir)}
                onDelete={() => removeField(i)}
                isDuplicateKey={duplicateKeys.has(field.key.trim())}
            />
        {/each}
        {#if customFields.length === 0}
            <div class="empty-state">No custom fields added yet.</div>
        {/if}
    </div>

    <!-- Add Field Button at Bottom (Only if items exist) -->
    {#if customFields.length > 0}
        <div class="bottom-add-container">
            <Button size="small" onclick={onAddField}>+ Add Field</Button>
        </div>
    {/if}
</div>

<style>
    .form-section {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        min-width: 0;
    }
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }
    label {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
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
    .separator-line {
        height: 1px;
        background: var(--color-border-primary);
        margin: 0.5rem 0;
    }
    .custom-fields-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .custom-fields-header h4 {
        margin: 0;
    }
    .fields-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .empty-state {
        text-align: center;
        padding: 2rem;
        color: var(--color-text-secondary);
        font-style: italic;
        background: var(--color-background-secondary);
        border-radius: 6px;
        border: 1px dashed var(--color-border-primary);
    }
    .bottom-add-container {
        margin-top: 1rem;
        display: flex;
    }
</style>
