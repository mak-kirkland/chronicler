<script lang="ts">
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import SearchableSelect from "$lib/components/ui/SearchableSelect.svelte";
    import DatePicker from "./DatePicker.svelte";
    import ColorSwatchRow from "./ColorSwatchRow.svelte";
    import type { CompiledCalendar } from "$lib/calendar";
    import type { TimelineData, TimelineEvent } from "$lib/timelineModels";
    import { genId } from "$lib/timelineModels";
    import { allFileTitles } from "$lib/worldStore";
    import { t, translate } from "$lib/i18n";

    let {
        cal,
        timeline,
        event = null,
        initial = {},
        onSave,
        onDelete = null,
        onClose,
    } = $props<{
        cal: CompiledCalendar;
        timeline: TimelineData;
        /** null = creating a new event. */
        event?: TimelineEvent | null;
        /** Prefill for creation (laneId, start). */
        initial?: Partial<TimelineEvent>;
        onSave: (event: TimelineEvent) => void;
        onDelete?: ((id: string) => void) | null;
        onClose: () => void;
    }>();

    let draft = $state<TimelineEvent>(
        event
            ? {
                  ...event,
                  start: { ...event.start },
                  end: event.end ? { ...event.end } : null,
              }
            : {
                  id: genId(),
                  laneId: initial.laneId ?? timeline.lanes[0].id,
                  title: "",
                  start: initial.start ?? { year: 1 },
                  end: null,
                  circa: false,
                  description: "",
                  pageLink: null,
                  color: null,
              },
    );
    let hasEnd = $state(draft.end != null);
    let pageLinkValue = $state(draft.pageLink ?? "");

    function submit(e?: Event) {
        if (e) e.preventDefault();
        if (!draft.title.trim()) return;
        onSave({
            ...draft,
            end: hasEnd ? (draft.end ?? { ...draft.start }) : null,
            pageLink: pageLinkValue || null,
        });
        onClose();
    }

    function confirmDelete() {
        if (!event || !onDelete) return;
        if (
            confirm(
                translate("timeline.deleteEventConfirm", {
                    title: event.title,
                }),
            )
        ) {
            onDelete(event.id);
            onClose();
        }
    }
</script>

<Modal
    title={event ? $t("timeline.editEvent") : $t("timeline.addEvent")}
    {onClose}
>
    <form onsubmit={submit} class="form">
        <label>
            {$t("timeline.eventTitleLabel")}
            <input type="text" bind:value={draft.title} />
        </label>
        <label>
            {$t("timeline.laneLabel")}
            <select bind:value={draft.laneId}>
                {#each timeline.lanes as lane (lane.id)}
                    <option value={lane.id}>
                        {lane.name || $t("timeline.unnamedLane")}
                    </option>
                {/each}
            </select>
        </label>
        <fieldset>
            <legend>{$t("timeline.startLabel")}</legend>
            <DatePicker
                {cal}
                value={draft.start}
                onChange={(d) => (draft.start = d)}
            />
        </fieldset>
        <label class="row">
            <input type="checkbox" bind:checked={hasEnd} />
            {$t("timeline.hasEnd")}
        </label>
        {#if hasEnd}
            <fieldset>
                <legend>{$t("timeline.endLabel")}</legend>
                <DatePicker
                    {cal}
                    value={draft.end ?? draft.start}
                    onChange={(d) => (draft.end = d)}
                />
            </fieldset>
        {/if}
        <label class="row">
            <input type="checkbox" bind:checked={draft.circa} />
            {$t("timeline.circaLabel")}
        </label>
        <label>
            {$t("timeline.descriptionLabel")}
            <textarea
                rows="4"
                bind:value={draft.description}
                placeholder={$t("timeline.descriptionPlaceholder")}
            ></textarea>
        </label>
        <label>
            {$t("timeline.pageLinkLabel")}
            <SearchableSelect
                options={$allFileTitles}
                bind:value={pageLinkValue}
                placeholder={$t("timeline.searchPagePlaceholder")}
            />
        </label>
        <div class="color-field">
            <span class="color-label">{$t("timeline.colorLabel")}</span>
            <ColorSwatchRow
                value={draft.color}
                onChange={(c) => (draft.color = c)}
            />
        </div>
        <div class="modal-actions">
            {#if event && onDelete}
                <Button
                    type="button"
                    variant="ghost"
                    class="text-btn"
                    onclick={confirmDelete}
                >
                    {$t("timeline.deleteEvent")}
                </Button>
            {/if}
            <Button
                type="button"
                variant="ghost"
                class="text-btn"
                onclick={onClose}
            >
                {$t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!draft.title.trim()}>
                {$t("common.save")}
            </Button>
        </div>
    </form>
</Modal>

<style>
    .form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: 420px;
    }
    label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.85rem;
        color: var(--color-text-secondary);
    }
    label.row {
        flex-direction: row;
        align-items: center;
        gap: 0.5rem;
    }
    input,
    select,
    textarea {
        padding: 0.4rem 0.6rem;
        border-radius: 4px;
        border: 1px solid var(--color-border-primary);
        background: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 0.95rem;
    }
    fieldset {
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
    }
    .color-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .color-label {
        font-size: 0.85rem;
        color: var(--color-text-secondary);
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
    /* The ghost variant is sized for icon glyphs (1.5rem); these are text
       actions, so pin them to the normal control size. */
    .form :global(.text-btn) {
        font-size: 0.95rem;
        padding: 0.4rem 0.8rem;
    }
</style>
