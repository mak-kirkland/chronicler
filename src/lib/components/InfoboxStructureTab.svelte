<script lang="ts">
    import type { EditorLayoutRule, EditorField } from "$lib/infobox";
    import Button from "./Button.svelte";
    import Icon from "./Icon.svelte";
    import SearchableSelect from "./SearchableSelect.svelte";
    import InfoboxColumnInput from "./InfoboxColumnInput.svelte";

    let {
        layoutRules = $bindable(),
        customFields,
        onAddRule,
    } = $props<{
        layoutRules: EditorLayoutRule[];
        customFields: EditorField[];
        onAddRule: (type: "header" | "separator" | "columns") => void;
    }>();

    function removeLayoutRule(index: number) {
        layoutRules.splice(index, 1);
    }

    function handleMove(index: number, direction: number) {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= layoutRules.length) return;
        const temp = layoutRules[index];
        layoutRules[index] = layoutRules[targetIndex];
        layoutRules[targetIndex] = temp;
    }
</script>

{#snippet structureButtons()}
    <Button size="small" onclick={() => onAddRule("header")}>+ Header</Button>
    <Button size="small" onclick={() => onAddRule("separator")}
        >+ Separator</Button
    >
    <Button size="small" onclick={() => onAddRule("columns")}>+ Columns</Button>
{/snippet}

<div class="form-section">
    <p class="helper-text">Define visual structure rules.</p>
    <div class="structure-toolbar">
        {@render structureButtons()}
    </div>
    <div class="fields-list">
        {#each layoutRules as rule, i (rule.id)}
            <!-- Using global Sortable Card Pattern classes -->
            <div class="sortable-card">
                <div class="sortable-handle">
                    <button
                        class="icon-btn"
                        onclick={() => handleMove(i, -1)}
                        disabled={i === 0}>▲</button
                    >
                    <button
                        class="icon-btn"
                        onclick={() => handleMove(i, 1)}
                        disabled={i === layoutRules.length - 1}>▼</button
                    >
                </div>
                <div class="sortable-content">
                    <div class="rule-header">
                        <span class="rule-type-badge type-{rule.type}"
                            >{rule.type.toUpperCase()}</span
                        >
                        <button
                            class="icon-btn danger"
                            onclick={() => removeLayoutRule(i)}
                            ><Icon type="close" /></button
                        >
                    </div>
                    <div class="rule-body">
                        {#if rule.type === "header"}
                            <input
                                type="text"
                                class="form-input"
                                bind:value={rule.text}
                                placeholder="Header Text"
                                aria-label="Header Text"
                            />
                        {/if}
                        {#if rule.type === "columns"}
                            <InfoboxColumnInput
                                bind:keys={rule.keys}
                                allFields={customFields.map((f) => f.key)}
                            />
                        {:else}
                            <div class="rule-position-row">
                                <div style="min-width: 200px;">
                                    <SearchableSelect
                                        options={customFields.map((f) => f.key)}
                                        bind:value={rule.above}
                                        placeholder="Place Above..."
                                    />
                                </div>
                                <div style="min-width: 200px;">
                                    <SearchableSelect
                                        options={customFields.map((f) => f.key)}
                                        bind:value={rule.below}
                                        placeholder="Place Below..."
                                    />
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/each}
    </div>

    <!-- Structure Toolbar at Bottom (Only if items exist) -->
    {#if layoutRules.length > 0}
        <div class="structure-toolbar bottom-toolbar">
            {@render structureButtons()}
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
    .helper-text {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        margin: 0;
    }
    .structure-toolbar {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
        align-items: center;
    }
    .bottom-toolbar {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px dashed var(--color-border-primary);
    }
    .fields-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .rule-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }
    .rule-type-badge {
        font-size: 0.7rem;
        font-weight: bold;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        background: var(--color-text-secondary);
        color: var(--color-background-primary);
    }
    /* .type-header is usually styled dynamically, can add specific classes if needed */
    .rule-body {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .rule-position-row {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
</style>
