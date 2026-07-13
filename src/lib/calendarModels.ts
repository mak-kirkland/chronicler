/**
 * @file Type definitions for custom calendars and variable-precision dates.
 * The calendar engine (calendar.ts) consumes these; they mirror the JSON
 * schema of files in `.chronicler/calendars/` (see the timelines design spec).
 */

export interface CalendarMonth {
    name: string;
    days: number;
}

/**
 * A Gregorian-class leap rule attached to one month: `extraDays` are added to
 * `monthIndex` in years where (year - offsetYears) is divisible by
 * `everyYears`, EXCEPT when also divisible by `exceptEveryYears`, UNLESS also
 * divisible by `unlessEveryYears`. (Gregorian: 4 / 100 / 400 on month 1.)
 */
export interface LeapRule {
    monthIndex: number;
    extraDays: number;
    everyYears: number;
    exceptEveryYears?: number | null;
    unlessEveryYears?: number | null;
    offsetYears?: number;
}

/**
 * A display era over the absolute year line, covering [startYear, endYear]
 * inclusive. `direction: 1` counts up from startYear ("year 1 of the era" is
 * startYear); `direction: -1` counts down toward endYear (BC-style: endYear
 * is "year 1"). Open ends: startYear null (open past, requires direction -1)
 * or endYear null (open future, requires direction 1).
 */
export interface CalendarEra {
    name: string;
    abbreviation: string;
    startYear: number | null;
    endYear: number | null;
    direction: 1 | -1;
}

export interface CalendarDef {
    version: 1;
    id: string;
    name: string;
    months: CalendarMonth[];
    leapRules: LeapRule[];
    eras: CalendarEra[];
    /** Empty array = this calendar has no week cycle. */
    weekdays: string[];
    /** Weekday index of absolute day 0 (start of year 1). */
    weekdayAnchor: number;
    hasYearZero: boolean;
}

/**
 * A variable-precision date. Precision is implied by which fields are
 * present and must be prefix-contiguous: no `day` without `month`, etc.
 * `month` is a 0-based index into `CalendarDef.months`; `day` is 1-based.
 */
export interface TimelineDate {
    year: number;
    month?: number;
    day?: number;
    hour?: number;
    minute?: number;
}

export type DatePrecision = "year" | "month" | "day" | "hour" | "minute";

export function datePrecision(date: TimelineDate): DatePrecision {
    if (date.minute != null) return "minute";
    if (date.hour != null) return "hour";
    if (date.day != null) return "day";
    if (date.month != null) return "month";
    return "year";
}

/** Drops fields of `date` finer than the precision of `template`. */
export function truncateToPrecision(
    date: TimelineDate,
    template: TimelineDate,
): TimelineDate {
    const p = datePrecision(template);
    const out: TimelineDate = { year: date.year };
    if (p === "year") return out;
    out.month = date.month ?? 0;
    if (p === "month") return out;
    out.day = date.day ?? 1;
    if (p === "day") return out;
    out.hour = date.hour ?? 0;
    if (p === "hour") return out;
    out.minute = date.minute ?? 0;
    return out;
}
