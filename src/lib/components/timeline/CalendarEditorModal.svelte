<script lang="ts">
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import type { CalendarDef, CalendarEra } from "$lib/calendarModels";
    import { validateCalendar, compileCalendar } from "$lib/calendar";
    import {
        saveVaultCalendar,
        removeVaultCalendar,
        vaultCalendars,
    } from "$lib/calendarStore";
    import { get } from "svelte/store";
    import { log } from "$lib/logger";
    import { t, translate } from "$lib/i18n";

    let {
        initial = null,
        onSaved = null,
        onClose,
    } = $props<{
        /** Calendar to edit, or null to start a fresh one. */
        initial?: CalendarDef | null;
        onSaved?: ((def: CalendarDef) => void) | null;
        onClose: () => void;
    }>();

    function blank(): CalendarDef {
        return {
            version: 1,
            id: "",
            name: "",
            months: [{ name: "First Month", days: 30 }],
            leapRules: [],
            eras: [],
            weekdays: [],
            weekdayAnchor: 0,
            hasYearZero: false,
        };
    }

    // Deep-clone so edits never touch the store/preset object.
    let def = $state<CalendarDef>(
        initial ? JSON.parse(JSON.stringify(initial)) : blank(),
    );
    const isNew = initial == null;
    let weekdaysText = $state(def.weekdays.join(", "));
    let saving = $state(false);

    const errors = $derived(validateCalendar(normalized()));
    const errorFor = (field: string) =>
        errors.find((e) => e.field.startsWith(field))?.message ?? null;

    function normalized(): CalendarDef {
        return {
            ...def,
            weekdays: weekdaysText
                .split(",")
                .map((w: string) => w.trim())
                .filter(Boolean),
        };
    }

    const preview = $derived.by(() => {
        const d = normalized();
        if (validateCalendar(d).length > 0) return null;
        const cal = compileCalendar(d);
        const sampleYear =
            d.eras.find((e) => e.direction === 1)?.startYear ?? 1;
        const month = Math.min(1, d.months.length - 1);
        return cal.format(
            {
                year: sampleYear,
                month,
                day: Math.min(12, d.months[month].days),
            },
            "long",
        );
    });

    function slugify(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 64);
    }

    function addEra() {
        const last = def.eras[def.eras.length - 1] as CalendarEra | undefined;
        def.eras = [
            ...def.eras,
            {
                name: "",
                abbreviation: "",
                startYear: last?.endYear != null ? last.endYear + 1 : 1,
                endYear: null,
                direction: 1,
            },
        ];
    }

    async function save() {
        saving = true;
        try {
            const final = normalized();
            await saveVaultCalendar(final);
            onSaved?.(final);
            onClose();
        } catch (e) {
            log.error("Calendar save failed", e, "CalendarEditorModal");
            alert(translate("timeline.calendarSaveFailed"));
        } finally {
            saving = false;
        }
    }

    async function remove() {
        if (
            !confirm(
                translate("timeline.deleteCalendarConfirm", {
                    name: def.name,
                }),
            )
        )
            return;
        await removeVaultCalendar(def.id);
        onClose();
    }

    const isVaultCalendar = $derived(get(vaultCalendars).has(def.id));
</script>

<Modal title={$t("timeline.calendarEditorTitle")} {onClose} wide>
    <div class="editor">
        <div class="identity-grid">
            <label>
                {$t("timeline.calendarNameLabel")}
                <input
                    type="text"
                    bind:value={def.name}
                    onblur={() => {
                        if (isNew && !def.id) def.id = slugify(def.name);
                    }}
                />
            </label>
            <label>
                {$t("timeline.calendarIdLabel")}
                <input type="text" bind:value={def.id} disabled={!isNew} />
                {#if errorFor("id")}
                    <span class="err">{errorFor("id")}</span>
                {/if}
            </label>
        </div>

        <section>
            <div class="section-head">
                <h4>{$t("timeline.monthsSection")}</h4>
                <Button
                    size="small"
                    onclick={() =>
                        (def.months = [...def.months, { name: "", days: 30 }])}
                    >{$t("timeline.addMonth")}</Button
                >
            </div>
            <div class="month-grid">
                <span class="col-head">{$t("timeline.monthNameLabel")}</span>
                <span class="col-head">{$t("timeline.monthDaysLabel")}</span>
                <span class="col-head"></span>
                {#each def.months as month, i (i)}
                    <input
                        type="text"
                        aria-label={$t("timeline.monthNameLabel")}
                        bind:value={month.name}
                    />
                    <input
                        type="number"
                        min="1"
                        aria-label={$t("timeline.monthDaysLabel")}
                        bind:value={month.days}
                    />
                    <Button
                        variant="ghost"
                        class="row-remove"
                        title={$t("timeline.removeMonth")}
                        onclick={() =>
                            (def.months = def.months.filter((_, j) => j !== i))}
                        >✕</Button
                    >
                {/each}
            </div>
            {#if errorFor("months")}
                <span class="err">{errorFor("months")}</span>
            {/if}
        </section>

        <section>
            <div class="section-head">
                <h4>{$t("timeline.leapSection")}</h4>
                <Button
                    size="small"
                    onclick={() =>
                        (def.leapRules = [
                            ...def.leapRules,
                            { monthIndex: 0, extraDays: 1, everyYears: 4 },
                        ])}>{$t("timeline.addLeapRule")}</Button
                >
            </div>
            {#if def.leapRules.length > 0}
                <div class="leap-grid">
                    <span class="col-head">
                        {$t("timeline.leapMonthLabel")}
                    </span>
                    <span class="col-head">
                        {$t("timeline.leapExtraDaysLabel")}
                    </span>
                    <span class="col-head">
                        {$t("timeline.leapEveryLabel")}
                    </span>
                    <span class="col-head">
                        {$t("timeline.leapExceptLabel")}
                    </span>
                    <span class="col-head">
                        {$t("timeline.leapUnlessLabel")}
                    </span>
                    <span class="col-head"></span>
                    {#each def.leapRules as rule, i (i)}
                        <select
                            aria-label={$t("timeline.leapMonthLabel")}
                            bind:value={rule.monthIndex}
                        >
                            {#each def.months as m, mi (mi)}
                                <option value={mi}>{m.name}</option>
                            {/each}
                        </select>
                        <input
                            type="number"
                            min="1"
                            aria-label={$t("timeline.leapExtraDaysLabel")}
                            bind:value={rule.extraDays}
                        />
                        <input
                            type="number"
                            min="1"
                            aria-label={$t("timeline.leapEveryLabel")}
                            bind:value={rule.everyYears}
                        />
                        <input
                            type="number"
                            min="1"
                            aria-label={$t("timeline.leapExceptLabel")}
                            bind:value={rule.exceptEveryYears}
                        />
                        <input
                            type="number"
                            min="1"
                            aria-label={$t("timeline.leapUnlessLabel")}
                            bind:value={rule.unlessEveryYears}
                        />
                        <Button
                            variant="ghost"
                            class="row-remove"
                            title={$t("timeline.removeLeapRule")}
                            onclick={() =>
                                (def.leapRules = def.leapRules.filter(
                                    (_, j) => j !== i,
                                ))}>✕</Button
                        >
                    {/each}
                </div>
            {/if}
            {#if errorFor("leapRules")}
                <span class="err">{errorFor("leapRules")}</span>
            {/if}
        </section>

        <section>
            <div class="section-head">
                <h4>{$t("timeline.erasSection")}</h4>
                <Button size="small" onclick={addEra}>
                    {$t("timeline.addEra")}
                </Button>
            </div>
            {#if def.eras.length > 0}
                <div class="era-grid">
                    <span class="col-head">
                        {$t("timeline.eraNameLabel")}
                    </span>
                    <span class="col-head">
                        {$t("timeline.eraAbbrevLabel")}
                    </span>
                    <span class="col-head">
                        {$t("timeline.eraStartLabel")}
                    </span>
                    <span class="col-head">
                        {$t("timeline.eraEndLabel")}
                    </span>
                    <span class="col-head">
                        {$t("timeline.eraDirectionLabel")}
                    </span>
                    <span class="col-head"></span>
                    {#each def.eras as era, i (i)}
                        <input
                            type="text"
                            aria-label={$t("timeline.eraNameLabel")}
                            bind:value={era.name}
                        />
                        <input
                            type="text"
                            aria-label={$t("timeline.eraAbbrevLabel")}
                            bind:value={era.abbreviation}
                        />
                        <input
                            type="number"
                            placeholder={$t("timeline.eraOpen")}
                            aria-label={$t("timeline.eraStartLabel")}
                            value={era.startYear ?? ""}
                            onchange={(e) =>
                                (era.startYear =
                                    e.currentTarget.value === ""
                                        ? null
                                        : Number(e.currentTarget.value))}
                        />
                        <input
                            type="number"
                            placeholder={$t("timeline.eraOpen")}
                            aria-label={$t("timeline.eraEndLabel")}
                            value={era.endYear ?? ""}
                            onchange={(e) =>
                                (era.endYear =
                                    e.currentTarget.value === ""
                                        ? null
                                        : Number(e.currentTarget.value))}
                        />
                        <select
                            bind:value={era.direction}
                            aria-label={$t("timeline.eraDirectionLabel")}
                        >
                            <option value={1}>
                                {$t("timeline.eraCountsUp")}
                            </option>
                            <option value={-1}>
                                {$t("timeline.eraCountsDown")}
                            </option>
                        </select>
                        <Button
                            variant="ghost"
                            class="row-remove"
                            title={$t("timeline.removeEra")}
                            onclick={() =>
                                (def.eras = def.eras.filter((_, j) => j !== i))}
                            >✕</Button
                        >
                        {#if errorFor(`eras[${i}]`)}
                            <span class="err era-err">
                                {errorFor(`eras[${i}]`)}
                            </span>
                        {/if}
                    {/each}
                </div>
            {/if}
            <span class="hint">{$t("timeline.eraOpenHint")}</span>
        </section>

        <section>
            <div class="section-head">
                <h4>{$t("timeline.weekdaysSection")}</h4>
            </div>
            <input type="text" bind:value={weekdaysText} />
            <span class="hint">{$t("timeline.weekdaysHint")}</span>
        </section>

        <label class="check-row">
            <input type="checkbox" bind:checked={def.hasYearZero} />
            {$t("timeline.hasYearZeroLabel")}
        </label>

        {#if preview}
            <div class="preview">
                {$t("timeline.previewLabel")}: {preview}
            </div>
        {/if}

        <div class="modal-actions">
            {#if !isNew && isVaultCalendar}
                <Button variant="ghost" class="text-btn" onclick={remove}>
                    {$t("timeline.deleteCalendar")}
                </Button>
            {/if}
            <Button variant="ghost" class="text-btn" onclick={onClose}>
                {$t("common.cancel")}
            </Button>
            <Button disabled={errors.length > 0 || saving} onclick={save}>
                {$t("timeline.saveCalendar")}
            </Button>
        </div>
    </div>
</Modal>

<style>
    .editor {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }
    .identity-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
    }
    section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .section-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--color-border-primary);
        padding-bottom: 0.35rem;
    }
    h4 {
        margin: 0;
        font-size: 1rem;
        color: var(--color-text-heading);
    }
    /* Aligned row grids with one header row per section. */
    .month-grid {
        display: grid;
        grid-template-columns: 1fr 110px 36px;
        gap: 0.4rem 0.6rem;
        align-items: center;
    }
    .leap-grid {
        display: grid;
        grid-template-columns: 1fr repeat(4, 110px) 36px;
        gap: 0.4rem 0.6rem;
        align-items: center;
    }
    .era-grid {
        display: grid;
        grid-template-columns: 1fr 90px 110px 110px 170px 36px;
        gap: 0.4rem 0.6rem;
        align-items: center;
    }
    .col-head {
        font-size: 0.72rem;
        color: var(--color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .era-err {
        grid-column: 1 / -1;
    }
    label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.85rem;
        color: var(--color-text-secondary);
    }
    .check-row {
        flex-direction: row;
        align-items: center;
        gap: 0.5rem;
        color: var(--color-text-primary);
    }
    input,
    select {
        box-sizing: border-box;
        width: 100%;
        padding: 0.35rem 0.55rem;
        border-radius: 4px;
        border: 1px solid var(--color-border-primary);
        background: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 0.9rem;
    }
    input[type="checkbox"] {
        width: auto;
    }
    /* The ghost variant is sized for icon glyphs (1.5rem); these are small
       inline controls, so pin them down. */
    .editor :global(.row-remove) {
        font-size: 0.85rem;
        padding: 0.25rem 0.4rem;
        justify-self: center;
    }
    .editor :global(.text-btn) {
        font-size: 0.95rem;
        padding: 0.4rem 0.8rem;
    }
    .err {
        color: var(--color-error, #c33);
        font-size: 0.75rem;
    }
    .hint {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
    }
    .preview {
        padding: 0.5rem 0.75rem;
        border: 1px dashed var(--color-border-primary);
        border-radius: 4px;
        color: var(--color-accent-primary);
        font-size: 0.9rem;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.25rem;
    }
</style>
