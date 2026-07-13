<script lang="ts">
    import type { CompiledCalendar } from "$lib/calendar";
    import type { TimelineDate } from "$lib/calendarModels";
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
    <label>
        {$t("timeline.yearLabel")}
        <input
            type="number"
            value={value.year}
            onchange={(e) => setYear(Number(e.currentTarget.value))}
        />
    </label>
    <label>
        {$t("timeline.monthLabel")}
        <select
            value={value.month ?? ""}
            onchange={(e) => setMonth(e.currentTarget.value)}
        >
            <option value="">{$t("timeline.monthNone")}</option>
            {#each monthOptions as m (m.i)}
                <option value={m.i}>{m.name}</option>
            {/each}
        </select>
    </label>
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
    input,
    select {
        padding: 0.3rem 0.5rem;
        border-radius: 4px;
        border: 1px solid var(--color-border-primary);
        background: var(--color-background-primary);
        color: var(--color-text-primary);
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
