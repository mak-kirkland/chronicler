/**
 * @file Shared fixtures for the calendar test suites. Kept out of any
 * `*.test.ts` file so importing it doesn't pull a second test file into the
 * module graph (which vitest would then execute twice).
 */
import type { CalendarDef } from "./calendarModels";

/** Minimal valid two-month calendar used across the engine tests. */
export function tinyCalendar(
    overrides: Partial<CalendarDef> = {},
): CalendarDef {
    return {
        version: 1,
        id: "tiny",
        name: "Tiny",
        months: [
            { name: "First", days: 10 },
            { name: "Second", days: 20 },
        ],
        leapRules: [],
        eras: [],
        weekdays: [],
        weekdayAnchor: 0,
        hasYearZero: false,
        ...overrides,
    };
}
