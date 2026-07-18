<script lang="ts">
    import type { CompiledCalendar } from "$lib/calendar";
    import type { TimelineDate } from "$lib/calendarModels";
    import Select from "$lib/components/ui/Select.svelte";
    import { t } from "$lib/i18n";

    let { cal, value, onChange } = $props<{
        cal: CompiledCalendar;
        value: TimelineDate;
        onChange: (next: TimelineDate) => void;
    }>();

    const monthOptions = $derived(
        cal.def.months.map((m: { name: string }, i: number) => ({
            i,
            name: m.name,
        })),
    );
    const maxDay = $derived(
        value.month != null ? cal.daysInMonth(value.year, value.month) : 1,
    );
    const preview = $derived(cal.format(value, "long"));

    function setYear(year: number) {
        if (!cal.def.hasYearZero && year === 0) year = 1;
        onChange({ ...value, year });
    }
    /** "" = absolute-year entry; otherwise the era index as a string. */
    let eraMode = $state<string>(initialEraMode());
    function initialEraMode(): string {
        const resolved = cal.eraOf(value.year);
        if (!resolved) return "";
        return String(cal.def.eras.indexOf(resolved.era));
    }
    const eraYear = $derived(cal.eraOf(value.year)?.eraYear ?? value.year);

    function setEraMode(raw: string) {
        eraMode = raw;
        if (raw === "") return; // absolute entry keeps the current year
        const idx = Number(raw);
        const resolved = cal.eraOf(value.year);
        // Keep the year if it's already inside the chosen era; otherwise
        // jump to that era's year 1 so the field shows something sane.
        if (!resolved || cal.def.eras.indexOf(resolved.era) !== idx) {
            onChange({ ...value, year: cal.absoluteYearFromEra(idx, 1) });
        }
    }
    function setEraYear(raw: number) {
        if (eraMode === "") return;
        const n = Math.max(1, Math.round(raw) || 1);
        onChange({
            ...value,
            year: cal.absoluteYearFromEra(Number(eraMode), n),
        });
    }
    function setMonth(raw: string) {
        if (raw === "") {
            onChange({ year: value.year });
        } else {
            const month = Number(raw);
            const day =
                value.day != null
                    ? Math.min(value.day, cal.daysInMonth(value.year, month))
                    : undefined;
            onChange({ ...value, month, day });
        }
    }
    function setDay(raw: string) {
        if (raw === "") {
            onChange({ year: value.year, month: value.month });
        } else {
            const day = Math.max(1, Math.min(Number(raw), maxDay));
            onChange({ ...value, day });
        }
    }
    function setTime(raw: string) {
        if (raw === "") {
            onChange({ year: value.year, month: value.month, day: value.day });
        } else {
            const [h, m] = raw.split(":").map(Number);
            onChange({ ...value, hour: h || 0, minute: m || 0 });
        }
    }
</script>

<div class="picker">
    {#if cal.def.eras.length > 0}
        <!-- Not wrapping <label>s: SelectTrigger is a button, so a label
             around it would open the dropdown on every label click. The
             visible text is paired with ariaLabel instead. -->
        <div class="field">
            <span class="field-label">{$t("timeline.eraLabel")}</span>
            <Select
                ariaLabel={$t("timeline.eraLabel")}
                options={[
                    { value: "", label: $t("timeline.eraAbsolute") },
                    ...cal.def.eras.map((era: { name: string }, i: number) => ({
                        value: String(i),
                        label: era.name,
                    })),
                ]}
                value={eraMode}
                onSelect={setEraMode}
            />
        </div>
    {/if}
    {#if eraMode === ""}
        <label>
            {$t("timeline.yearLabel")}
            <input
                type="number"
                value={value.year}
                onchange={(e) => setYear(Number(e.currentTarget.value))}
            />
        </label>
    {:else}
        <label>
            {$t("timeline.yearLabel")}
            <input
                type="number"
                min="1"
                value={eraYear}
                onchange={(e) => setEraYear(Number(e.currentTarget.value))}
            />
        </label>
    {/if}
    <div class="field">
        <span class="field-label">{$t("timeline.monthLabel")}</span>
        <Select
            ariaLabel={$t("timeline.monthLabel")}
            options={[
                { value: "", label: $t("timeline.monthNone") },
                ...monthOptions.map((m: { i: number; name: string }) => ({
                    value: String(m.i),
                    label: m.name,
                })),
            ]}
            value={value.month != null ? String(value.month) : ""}
            onSelect={setMonth}
        />
    </div>
    {#if value.month != null}
        <label>
            {$t("timeline.dayLabel")}
            <input
                type="number"
                min="1"
                max={maxDay}
                value={value.day ?? ""}
                placeholder={$t("timeline.dayNone")}
                onchange={(e) => setDay(e.currentTarget.value)}
            />
        </label>
    {/if}
    {#if value.day != null}
        <label>
            {$t("timeline.hourLabel")}
            <input
                type="time"
                value={value.hour != null
                    ? `${String(value.hour).padStart(2, "0")}:${String(value.minute ?? 0).padStart(2, "0")}`
                    : ""}
                onchange={(e) => setTime(e.currentTarget.value)}
            />
        </label>
    {/if}
    <div class="preview">{preview}</div>
</div>

<style>
    .picker {
        display: flex;
        flex-wrap: wrap;
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
    input {
        padding: 0.3rem 0.5rem;
        border-radius: 4px;
        border: 1px solid var(--color-border-primary);
        background: var(--color-background-primary);
        color: var(--color-text-primary);
    }
    /* Mirrors the <label> stacks beside it. */
    .field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        /* The wrapper inside is width: 100%, so the column needs a width of
           its own — otherwise it collapses to the width of the label text. */
        width: 10rem;
    }
    .field-label {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
    }
    /* The shared trigger is sized for full-width forms; this row is compact. */
    .field :global(.select-trigger) {
        padding: 0.3rem 0.5rem;
        border-radius: 4px;
        background: var(--color-background-primary);
        font-size: 0.85rem;
    }
    input[type="number"] {
        width: 6rem;
    }
    .preview {
        flex-basis: 100%;
        font-size: 0.85rem;
        color: var(--color-accent-primary);
    }
</style>
