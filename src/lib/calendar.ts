/**
 * @file The pure calendar engine. No UI or Tauri imports — everything here is
 * synchronous math over CalendarDef, unit-tested in calendar.test.ts. The
 * single primitive is the "serial": fractional days since the start of
 * absolute year 1. Rendering maps serial -> pixels (timelineViewport.ts).
 */
import type { CalendarDef, CalendarEra, TimelineDate } from "./calendarModels";
import { datePrecision } from "./calendarModels";

export interface CalendarError {
    field: string;
    message: string;
}

export class CalendarValidationError extends Error {
    errors: CalendarError[];
    constructor(errors: CalendarError[]) {
        super(`Invalid calendar: ${errors.map((e) => e.field).join(", ")}`);
        this.errors = errors;
    }
}

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Largest leap cycle (lcm of all rule periods) we accept. The Gregorian
 * cycle is 400. compileCalendar tabulates one cycle (8 bytes a year), so
 * this caps that table at 8 MB and its build at a million daysInYear calls. */
const MAX_LEAP_CYCLE = 1_000_000;

export function validateCalendar(def: CalendarDef): CalendarError[] {
    const errors: CalendarError[] = [];
    const err = (field: string, message: string) =>
        errors.push({ field, message });

    if (!ID_RE.test(def.id)) err("id", "must match ^[a-z0-9][a-z0-9_-]{0,63}$");
    if (!def.name.trim()) err("name", "must not be empty");

    if (def.months.length === 0)
        err("months", "at least one month is required");
    def.months.forEach((m, i) => {
        if (!m.name.trim()) err(`months[${i}].name`, "must not be empty");
        if (!Number.isInteger(m.days) || m.days < 1)
            err(`months[${i}].days`, "must be an integer >= 1");
    });

    def.leapRules.forEach((r, i) => {
        if (
            !Number.isInteger(r.monthIndex) ||
            r.monthIndex < 0 ||
            r.monthIndex >= def.months.length
        )
            err(`leapRules[${i}].monthIndex`, "must index an existing month");
        if (!Number.isInteger(r.extraDays) || r.extraDays < 1)
            err(`leapRules[${i}].extraDays`, "must be an integer >= 1");
        if (!Number.isInteger(r.everyYears) || r.everyYears < 1)
            err(`leapRules[${i}].everyYears`, "must be an integer >= 1");
        if (
            r.exceptEveryYears != null &&
            (!Number.isInteger(r.exceptEveryYears) || r.exceptEveryYears < 1)
        )
            err(`leapRules[${i}].exceptEveryYears`, "must be an integer >= 1");
        if (r.unlessEveryYears != null && r.exceptEveryYears == null)
            err(
                `leapRules[${i}].unlessEveryYears`,
                "requires exceptEveryYears",
            );
    });
    if (leapCycleOf(def) > MAX_LEAP_CYCLE)
        err("leapRules", `combined leap cycle exceeds ${MAX_LEAP_CYCLE} years`);

    def.eras.forEach((e, i) => {
        if (!e.name.trim()) err(`eras[${i}].name`, "must not be empty");
        if (e.direction === 1 && e.startYear == null)
            err(`eras[${i}]`, "direction 1 requires startYear");
        if (e.direction === -1 && e.endYear == null)
            err(`eras[${i}]`, "direction -1 requires endYear");
        if (e.startYear != null && e.endYear != null && e.startYear > e.endYear)
            err(`eras[${i}]`, "startYear must be <= endYear");
        if (!def.hasYearZero && (e.startYear === 0 || e.endYear === 0))
            err(`eras[${i}]`, "year 0 does not exist in this calendar");
    });
    // Eras must be ascending and non-overlapping.
    for (let i = 1; i < def.eras.length; i++) {
        const prev = def.eras[i - 1];
        const cur = def.eras[i];
        if (
            prev.endYear == null ||
            cur.startYear == null ||
            cur.startYear <= prev.endYear
        )
            err(`eras[${i}]`, "eras must be ascending and non-overlapping");
    }

    if (def.weekdays.length > 0) {
        if (
            !Number.isInteger(def.weekdayAnchor) ||
            def.weekdayAnchor < 0 ||
            def.weekdayAnchor >= def.weekdays.length
        )
            err("weekdayAnchor", "must index a weekday");
        def.weekdays.forEach((w, i) => {
            if (!w.trim()) err(`weekdays[${i}]`, "must not be empty");
        });
    }
    return errors;
}

function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
}
function lcm(a: number, b: number): number {
    return (a / gcd(a, b)) * b;
}

/** The period (in years) after which the leap pattern repeats. Periods that
 * aren't positive integers are skipped: validateCalendar reports them, and
 * it runs this on unvalidated input (a cleared editor field binds null),
 * where gcd would recurse forever on NaN. */
function leapCycleOf(def: CalendarDef): number {
    let cycle = 1;
    for (const r of def.leapRules) {
        for (const period of [
            r.everyYears,
            r.exceptEveryYears,
            r.unlessEveryYears,
        ]) {
            if (!Number.isInteger(period) || (period as number) < 1) continue;
            cycle = lcm(cycle, period as number);
            if (cycle > MAX_LEAP_CYCLE) return cycle;
        }
    }
    return cycle;
}

export interface CompiledCalendar {
    def: CalendarDef;
    monthCount: number;
    nextYear(y: number): number;
    prevYear(y: number): number;
    daysInMonth(year: number, month: number): number;
    daysInYear(year: number): number;
    yearStartSerial(year: number): number;
    toSerial(date: TimelineDate): number;
    fromSerial(serial: number): {
        year: number;
        month: number;
        day: number;
        hour: number;
        minute: number;
    };
    serialRange(date: TimelineDate): [number, number];
    /** Coerces a stored date into one this calendar can represent. */
    clampDate(date: TimelineDate): TimelineDate;
    compareDates(a: TimelineDate, b: TimelineDate): number;
    addDays(date: TimelineDate, days: number): TimelineDate;
    diffDays(a: TimelineDate, b: TimelineDate): number;
    weekdayOf(serial: number): number | null;
    eraOf(year: number): { era: CalendarEra; eraYear: number } | null;
    /** Inverse of eraOf: absolute year for "year N of era at index i". */
    absoluteYearFromEra(eraIndex: number, eraYear: number): number;
    format(date: TimelineDate, style?: "long" | "short" | "numeric"): string;
    yearLabel(year: number, style: "long" | "short" | "numeric"): string;
}

const mod = (a: number, b: number) => ((a % b) + b) % b;

export function compileCalendar(def: CalendarDef): CompiledCalendar {
    const errors = validateCalendar(def);
    if (errors.length > 0) throw new CalendarValidationError(errors);

    const baseYearDays = def.months.reduce((sum, m) => sum + m.days, 0);
    const cycle = leapCycleOf(def);

    function leapApplies(
        rule: (typeof def.leapRules)[number],
        year: number,
    ): boolean {
        const n = year - (rule.offsetYears ?? 0);
        if (mod(n, rule.everyYears) !== 0) return false;
        if (rule.exceptEveryYears && mod(n, rule.exceptEveryYears) === 0) {
            return !!(
                rule.unlessEveryYears && mod(n, rule.unlessEveryYears) === 0
            );
        }
        return true;
    }

    function daysInMonth(year: number, month: number): number {
        let days = def.months[month].days;
        for (const rule of def.leapRules) {
            if (rule.monthIndex === month && leapApplies(rule, year)) {
                days += rule.extraDays;
            }
        }
        return days;
    }

    function daysInYear(year: number): number {
        let days = baseYearDays;
        for (const rule of def.leapRules) {
            if (leapApplies(rule, year)) days += rule.extraDays;
        }
        return days;
    }

    /** cycleDays[k] = days in years 1..k, for k in [0, cycle]. The leap
     * pattern is periodic in the raw year number, so this one table gives
     * the length of any run of years in O(1). */
    const cycleDays = new Float64Array(cycle + 1);
    for (let k = 1; k <= cycle; k++) {
        cycleDays[k] = cycleDays[k - 1] + daysInYear(k);
    }
    const daysPerCycle = cycleDays[cycle];

    /** Days in raw years 1..x, extended to every integer x by periodicity
     * (so it is negative for x < 0), making daysThrough(b) - daysThrough(a-1)
     * the length of years a..b. Raw numbering counts a year 0 even when the
     * calendar has none; `negativeShift` takes it back out. */
    function daysThrough(x: number): number {
        const q = Math.floor(x / cycle);
        return q * daysPerCycle + cycleDays[x - q * cycle];
    }
    /** daysThrough(firstNegative): 0 with a year zero, otherwise minus the
     * length of the year 0 that raw numbering would put before year 1. */
    const negativeShift = daysThrough(def.hasYearZero ? 0 : -1);

    function assertYearExists(y: number): void {
        if (!def.hasYearZero && y === 0) {
            throw new RangeError("Year 0 does not exist in this calendar");
        }
    }
    function nextYear(y: number): number {
        const n = y + 1;
        return !def.hasYearZero && n === 0 ? 1 : n;
    }
    function prevYear(y: number): number {
        const n = y - 1;
        return !def.hasYearZero && n === 0 ? -1 : n;
    }

    function yearStartSerial(y: number): number {
        assertYearExists(y);
        // Year 1 starts at serial 0; negative years count back from there
        // over only the years that exist.
        return y >= 1 ? daysThrough(y - 1) : daysThrough(y - 1) - negativeShift;
    }

    function toSerial(date: TimelineDate): number {
        assertYearExists(date.year);
        let s = yearStartSerial(date.year);
        const month = date.month ?? 0;
        for (let m = 0; m < month; m++) s += daysInMonth(date.year, m);
        s += (date.day ?? 1) - 1;
        s += (date.hour ?? 0) / 24 + (date.minute ?? 0) / 1440;
        return s;
    }

    function fromSerial(serial: number) {
        // Whole minutes first, so float drift just short of midnight (the
        // axis steps ticks by repeated addition) rolls into the next day
        // instead of reading 23:59. `|| 0` turns -0 into 0.
        const minutes = Math.round(serial * 1440) || 0;
        const dayIndex = Math.floor(minutes / 1440);
        const totalMinutes = minutes - dayIndex * 1440;

        // The year is x + 1 for the largest raw x with daysThrough(x) at or
        // before the day (shifted past the missing year 0 when negative):
        // whole cycles by division, then a binary search of the table.
        const target = dayIndex >= 0 ? dayIndex : dayIndex + negativeShift;
        const q = Math.floor(target / daysPerCycle);
        const inCycle = target - q * daysPerCycle;
        let lo = 0;
        let hi = cycle - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (cycleDays[mid] <= inCycle) lo = mid;
            else hi = mid - 1;
        }
        const y = q * cycle + lo + 1;

        let rem = dayIndex - yearStartSerial(y);
        let month = 0;
        while (rem >= daysInMonth(y, month)) {
            rem -= daysInMonth(y, month);
            month++;
        }
        return {
            year: y,
            month,
            day: rem + 1,
            hour: Math.floor(totalMinutes / 60),
            minute: totalMinutes % 60,
        };
    }

    function serialRange(date: TimelineDate): [number, number] {
        const min = toSerial(date);
        let max: number;
        if (date.minute != null) max = min + 1 / 1440;
        else if (date.hour != null) max = min + 1 / 24;
        else if (date.day != null) max = min + 1;
        else if (date.month != null)
            max = min + daysInMonth(date.year, date.month);
        else max = yearStartSerial(nextYear(date.year));
        return [min, max];
    }

    /**
     * Dates are stored as bare indices, so an event saved under another
     * calendar (or under this one before months were removed) can name a
     * year, month or day that doesn't exist here, which the functions above
     * reject or crash on. Pins each field to its nearest valid value, and
     * returns the input itself when nothing needed changing.
     */
    function clampDate(date: TimelineDate): TimelineDate {
        const out: TimelineDate = { ...date, year: Math.trunc(date.year) };
        if (!def.hasYearZero && out.year === 0) out.year = 1;
        if (out.month != null) {
            out.month = Math.min(
                Math.max(Math.trunc(out.month), 0),
                def.months.length - 1,
            );
            if (out.day != null) {
                out.day = Math.min(
                    Math.max(out.day, 1),
                    daysInMonth(out.year, out.month),
                );
            }
        }
        const same =
            out.year === date.year &&
            out.month === date.month &&
            out.day === date.day;
        return same ? date : out;
    }

    const PRECISION_RANK: Record<string, number> = {
        year: 0,
        month: 1,
        day: 2,
        hour: 3,
        minute: 4,
    };

    function compareDates(a: TimelineDate, b: TimelineDate): number {
        const d = serialRange(a)[0] - serialRange(b)[0];
        if (d !== 0) return d;
        return (
            PRECISION_RANK[datePrecision(a)] - PRECISION_RANK[datePrecision(b)]
        );
    }

    function addDays(date: TimelineDate, days: number): TimelineDate {
        return fromSerial(toSerial(date) + days);
    }

    function diffDays(a: TimelineDate, b: TimelineDate): number {
        return toSerial(b) - toSerial(a);
    }

    function weekdayOf(serial: number): number | null {
        if (def.weekdays.length === 0) return null;
        return mod(Math.floor(serial) + def.weekdayAnchor, def.weekdays.length);
    }

    function eraOf(year: number): { era: CalendarEra; eraYear: number } | null {
        for (const era of def.eras) {
            const startOk = era.startYear == null || year >= era.startYear;
            const endOk = era.endYear == null || year <= era.endYear;
            if (!startOk || !endOk) continue;
            let eraYear =
                era.direction === 1
                    ? year - (era.startYear as number) + 1
                    : (era.endYear as number) - year + 1;
            if (!def.hasYearZero) {
                // The missing year 0 removes one countable year when the
                // era's reference bound and the target year straddle zero.
                if (
                    era.direction === 1 &&
                    (era.startYear as number) < 0 &&
                    year > 0
                )
                    eraYear -= 1;
                if (
                    era.direction === -1 &&
                    (era.endYear as number) > 0 &&
                    year < 0
                )
                    eraYear -= 1;
            }
            return { era, eraYear };
        }
        return null;
    }

    /**
     * Inverse of eraOf: the absolute year for "year N of era E". Computes
     * the naive candidate from the era's reference bound, then corrects by
     * round-tripping through eraOf, which owns the year-zero straddle
     * rules — the two stay consistent by construction. The correction itself
     * may cross year 0 in a no-year-zero calendar, so the result is re-checked.
     */
    function absoluteYearFromEra(eraIndex: number, eraYear: number): number {
        const era = def.eras[eraIndex];
        let year =
            era.direction === 1
                ? (era.startYear ?? 1) + eraYear - 1
                : (era.endYear ?? -1) - eraYear + 1;
        if (!def.hasYearZero && year === 0) {
            year = era.direction === 1 ? -1 : 1;
        }
        const check = eraOf(year);
        if (check && check.era === era && check.eraYear !== eraYear) {
            year += era.direction * (eraYear - check.eraYear);
            if (!def.hasYearZero && year === 0) year += era.direction;
        }
        return year;
    }

    function yearLabel(
        year: number,
        style: "long" | "short" | "numeric",
    ): string {
        const resolved = eraOf(year);
        if (!resolved) return style === "numeric" ? `${year}` : `Year ${year}`;
        return `${resolved.eraYear} ${resolved.era.abbreviation}`;
    }

    function pad2(n: number): string {
        return String(n).padStart(2, "0");
    }

    function format(
        date: TimelineDate,
        style: "long" | "short" | "numeric" = "long",
    ): string {
        const year = yearLabel(date.year, style);
        const time =
            date.hour != null
                ? ` ${pad2(date.hour)}:${pad2(date.minute ?? 0)}`
                : "";
        if (style === "numeric") {
            let out = year;
            if (date.month != null) {
                // Numeric style: place era abbreviation after the date digits.
                const [digits, ...suffix] = year.split(" ");
                out = `${digits}.${pad2(date.month + 1)}`;
                if (date.day != null) out += `.${pad2(date.day)}`;
                if (suffix.length) out += ` ${suffix.join(" ")}`;
            }
            return out + time;
        }
        const monthName =
            date.month != null ? def.months[date.month].name : null;
        if (monthName == null) return year + time;
        const dayPart = date.day != null ? `${date.day} ` : "";
        const sep = style === "long" ? ", " : " ";
        return `${dayPart}${monthName}${sep}${year}${time}`;
    }

    return {
        def,
        monthCount: def.months.length,
        nextYear,
        prevYear,
        daysInMonth,
        daysInYear,
        yearStartSerial,
        toSerial,
        fromSerial,
        serialRange,
        clampDate,
        compareDates,
        addDays,
        diffDays,
        weekdayOf,
        eraOf,
        absoluteYearFromEra,
        format,
        yearLabel,
    };
}
