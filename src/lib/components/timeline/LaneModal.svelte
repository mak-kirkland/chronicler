<script lang="ts">
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
    import ColorSwatchRow from "./ColorSwatchRow.svelte";
    import type { LaneSource, TimelineLane } from "$lib/timelineModels";
    import { t } from "$lib/i18n";

    let { lane, tagOptions, folderOptions, onSave, onClose } = $props<{
        /** null = creating a new lane. */
        lane: TimelineLane | null;
        tagOptions: string[];
        folderOptions: string[];
        onSave: (
            name: string,
            color: string | null,
            sources: LaneSource[],
        ) => void;
        onClose: () => void;
    }>();

    let name = $state<string>(lane?.name ?? "");
    let color = $state<string | null>(lane?.color ?? null);

    /** Editable copies; "" means unset for the select components. */
    let rows = $state<{ tag: string; folder: string }[]>(
        (lane?.sources ?? []).map((s: LaneSource) => ({
            tag: s.tag ?? "",
            folder: s.folder ?? "",
        })),
    );

    function addRow() {
        rows.push({ tag: "", folder: "" });
    }
    function removeRow(i: number) {
        rows.splice(i, 1);
    }
    function save() {
        onSave(
            name.trim(),
            color,
            rows
                .map((r) => ({
                    tag: r.tag || null,
                    folder: r.folder || null,
                }))
                .filter((r) => r.tag !== null || r.folder !== null),
        );
        onClose();
    }
</script>

<Modal
    title={lane === null
        ? $t("timeline.addLane")
        : $t("timeline.editLaneTitle")}
    {onClose}
>
    <div class="lane-form">
        <label class="name-field">
            {$t("timeline.laneNameLabel")}
            <!-- svelte-ignore a11y_autofocus -->
            <input type="text" bind:value={name} autofocus={lane === null} />
        </label>
        <div class="color-field">
            <span class="field-label">{$t("timeline.laneColorLabel")}</span>
            <ColorSwatchRow value={color} onChange={(c) => (color = c)} />
        </div>
        <div class="sources">
            <span class="field-label">{$t("timeline.sourcesTitle")}</span>
            <p class="hint">{$t("timeline.sourcesHint")}</p>
            {#each rows as row, i (i)}
                <div class="row">
                    <label>
                        {$t("timeline.sourceTagLabel")}
                        <SearchableSelect
                            options={tagOptions}
                            bind:value={row.tag}
                            placeholder={$t("timeline.sourceAnyPlaceholder")}
                        />
                    </label>
                    <label>
                        {$t("timeline.sourceFolderLabel")}
                        <SearchableSelect
                            options={folderOptions}
                            bind:value={row.folder}
                            placeholder={$t("timeline.sourceAnyPlaceholder")}
                        />
                    </label>
                    <Button
                        variant="ghost"
                        class="row-remove"
                        onclick={() => removeRow(i)}
                        title={$t("timeline.removeSource")}
                    >
                        ✕
                    </Button>
                </div>
            {/each}
            <Button size="small" onclick={addRow}>
                {$t("timeline.addSource")}
            </Button>
        </div>
        <div class="modal-actions">
            <Button variant="ghost" class="text-btn" onclick={onClose}>
                {$t("common.cancel")}
            </Button>
            <Button onclick={save}>
                {lane === null ? $t("timeline.addLane") : $t("common.save")}
            </Button>
        </div>
    </div>
</Modal>

<style>
    .lane-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 480px;
    }
    .field-label {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
    }
    .name-field input {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 1rem;
        box-sizing: border-box;
    }
    .name-field input:focus {
        outline: 1px solid var(--color-accent-primary);
        border-color: var(--color-accent-primary);
    }
    .color-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .sources {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .hint {
        margin: 0;
        font-size: 0.8rem;
        color: var(--color-text-secondary);
    }
    .row {
        display: grid;
        grid-template-columns: 1fr 1fr 36px;
        gap: 0.5rem;
        align-items: end;
    }
    label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.8rem;
        color: var(--color-text-secondary);
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
    /* Ghost is icon-sized; normalize the text/glyph buttons. */
    .lane-form :global(.text-btn) {
        font-size: 0.95rem;
        padding: 0.4rem 0.8rem;
    }
    .lane-form :global(.row-remove) {
        font-size: 0.9rem;
        padding: 0.3rem;
    }
</style>
