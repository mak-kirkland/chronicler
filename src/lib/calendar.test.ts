import { describe, it, expect } from "vitest";
import { validateCalendar, compileCalendar } from "./calendar";
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

describe("validateCalendar", () => {
    it("accepts a minimal valid calendar", () => {
        expect(validateCalendar(tinyCalendar())).toEqual([]);
    });

    it("rejects an empty month list", () => {
        const errors = validateCalendar(tinyCalendar({ months: [] }));
        expect(errors.some((e) => e.field === "months")).toBe(true);
    });

    it("rejects a zero-day month", () => {
        const errors = validateCalendar(
            tinyCalendar({ months: [{ name: "Bad", days: 0 }] }),
        );
        expect(errors.some((e) => e.field === "months[0].days")).toBe(true);
    });

    it("rejects a bad id", () => {
        const errors = validateCalendar(tinyCalendar({ id: "Bad Id!" }));
        expect(errors.some((e) => e.field === "id")).toBe(true);
    });

    it("rejects a leap rule pointing at a missing month", () => {
        const errors = validateCalendar(
            tinyCalendar({
                leapRules: [{ monthIndex: 9, extraDays: 1, everyYears: 4 }],
            }),
        );
        expect(errors.some((e) => e.field === "leapRules[0].monthIndex")).toBe(
            true,
        );
    });

    it("rejects a direction 1 era without a startYear", () => {
        const errors = validateCalendar(
            tinyCalendar({
                eras: [
                    {
                        name: "X",
                        abbreviation: "X",
                        startYear: null,
                        endYear: null,
                        direction: 1,
                    },
                ],
            }),
        );
        expect(errors.some((e) => e.field === "eras[0]")).toBe(true);
    });

    it("rejects overlapping eras", () => {
        const errors = validateCalendar(
            tinyCalendar({
                eras: [
                    {
                        name: "A",
                        abbreviation: "A",
                        startYear: 1,
                        endYear: 100,
                        direction: 1,
                    },
                    {
                        name: "B",
                        abbreviation: "B",
                        startYear: 50,
                        endYear: null,
                        direction: 1,
                    },
                ],
            }),
        );
        expect(errors.some((e) => e.field === "eras[1]")).toBe(true);
    });

    it("rejects an era bound of year 0 when the calendar has no year zero", () => {
        const errors = validateCalendar(
            tinyCalendar({
                eras: [
                    {
                        name: "A",
                        abbreviation: "A",
                        startYear: 0,
                        endYear: null,
                        direction: 1,
                    },
                ],
            }),
        );
        expect(errors.some((e) => e.field === "eras[0]")).toBe(true);
    });

    it("rejects a weekdayAnchor outside the weekday cycle", () => {
        const errors = validateCalendar(
            tinyCalendar({ weekdays: ["A", "B"], weekdayAnchor: 5 }),
        );
        expect(errors.some((e) => e.field === "weekdayAnchor")).toBe(true);
    });
});

describe("compileCalendar", () => {
    it("throws CalendarValidationError with the error list on invalid input", () => {
        expect(() =>
            compileCalendar(tinyCalendar({ months: [] })),
        ).toThrowError(expect.objectContaining({ errors: expect.any(Array) }));
    });

    it("returns a compiled calendar for valid input", () => {
        const cal = compileCalendar(tinyCalendar());
        expect(cal.monthCount).toBe(2);
        expect(cal.def.id).toBe("tiny");
    });
});

describe("serial math", () => {
    // tinyCalendar: 30-day year (10 + 20), no leap, no year zero.
    it("serial 0 is the start of year 1", () => {
        const cal = compileCalendar(tinyCalendar());
        expect(cal.toSerial({ year: 1 })).toBe(0);
        expect(cal.toSerial({ year: 1, month: 0, day: 1 })).toBe(0);
    });

    it("advances through months and days", () => {
        const cal = compileCalendar(tinyCalendar());
        expect(cal.toSerial({ year: 1, month: 1, day: 1 })).toBe(10);
        expect(cal.toSerial({ year: 1, month: 1, day: 20 })).toBe(29);
        expect(cal.toSerial({ year: 2 })).toBe(30);
    });

    it("encodes time of day as a fraction", () => {
        const cal = compileCalendar(tinyCalendar());
        expect(cal.toSerial({ year: 1, month: 0, day: 1, hour: 12 })).toBe(0.5);
        expect(
            cal.toSerial({ year: 1, month: 0, day: 2, hour: 6, minute: 30 }),
        ).toBeCloseTo(1 + 6.5 / 24, 10);
    });

    it("skips year 0 when hasYearZero is false", () => {
        const cal = compileCalendar(tinyCalendar());
        // Year -1 is the year immediately before year 1.
        expect(cal.toSerial({ year: -1 })).toBe(-30);
        expect(cal.nextYear(-1)).toBe(1);
        expect(cal.prevYear(1)).toBe(-1);
        expect(() => cal.toSerial({ year: 0 })).toThrow();
    });

    it("includes year 0 when hasYearZero is true", () => {
        const cal = compileCalendar(tinyCalendar({ hasYearZero: true }));
        expect(cal.toSerial({ year: 0 })).toBe(-30);
        expect(cal.nextYear(-1)).toBe(0);
    });

    it("applies simple leap rules", () => {
        const cal = compileCalendar(
            tinyCalendar({
                leapRules: [{ monthIndex: 0, extraDays: 1, everyYears: 4 }],
            }),
        );
        expect(cal.daysInYear(4)).toBe(31);
        expect(cal.daysInYear(5)).toBe(30);
        expect(cal.daysInMonth(4, 0)).toBe(11);
        // Years 1..4 = 30 + 30 + 30 + 31.
        expect(cal.toSerial({ year: 5 })).toBe(121);
    });

    it("applies Gregorian-style except/unless leap rules", () => {
        const cal = compileCalendar(
            tinyCalendar({
                leapRules: [
                    {
                        monthIndex: 0,
                        extraDays: 1,
                        everyYears: 4,
                        exceptEveryYears: 100,
                        unlessEveryYears: 400,
                    },
                ],
            }),
        );
        expect(cal.daysInYear(2024)).toBe(31); // divisible by 4
        expect(cal.daysInYear(1900)).toBe(30); // except every 100
        expect(cal.daysInYear(2000)).toBe(31); // unless every 400
        expect(cal.daysInYear(-4)).toBe(31); // negative years leap too
    });

    it("round-trips fromSerial(toSerial(d)) across a spread of dates", () => {
        const cal = compileCalendar(
            tinyCalendar({
                leapRules: [{ monthIndex: 1, extraDays: 2, everyYears: 3 }],
            }),
        );
        for (const year of [-500, -3, -1, 1, 2, 3, 4, 250, 100000]) {
            for (const month of [0, 1]) {
                const date = { year, month, day: 3, hour: 7, minute: 45 };
                expect(cal.fromSerial(cal.toSerial(date))).toEqual(date);
            }
        }
    });

    it("computes far-future years without hanging (cycle acceleration)", () => {
        const cal = compileCalendar(
            tinyCalendar({
                leapRules: [
                    {
                        monthIndex: 0,
                        extraDays: 1,
                        everyYears: 4,
                        exceptEveryYears: 100,
                        unlessEveryYears: 400,
                    },
                ],
            }),
        );
        // 400-year cycle over 30-day base years: 400*30 + 97 leap days.
        expect(cal.toSerial({ year: 400001 })).toBe(1000 * (400 * 30 + 97));
    });
});

describe("ranges, comparison, eras, weekdays", () => {
    it("serialRange spans the whole unit for partial dates", () => {
        const cal = compileCalendar(tinyCalendar());
        expect(cal.serialRange({ year: 1 })).toEqual([0, 30]);
        expect(cal.serialRange({ year: 1, month: 1 })).toEqual([10, 30]);
        expect(cal.serialRange({ year: 1, month: 0, day: 2 })).toEqual([1, 2]);
        expect(cal.serialRange({ year: 1, month: 0, day: 1, hour: 0 })).toEqual(
            [0, 1 / 24],
        );
    });

    it("serialRange crosses the missing year 0", () => {
        const cal = compileCalendar(tinyCalendar());
        expect(cal.serialRange({ year: -1 })).toEqual([-30, 0]);
    });

    it("compareDates sorts by range start, coarser first on ties", () => {
        const cal = compileCalendar(tinyCalendar());
        const yearOnly = { year: 2 };
        const precise = { year: 2, month: 0, day: 1 };
        const later = { year: 2, month: 0, day: 5 };
        expect(cal.compareDates(yearOnly, precise)).toBeLessThan(0);
        expect(cal.compareDates(precise, later)).toBeLessThan(0);
        expect(cal.compareDates(later, yearOnly)).toBeGreaterThan(0);
    });

    it("addDays and diffDays round-trip", () => {
        const cal = compileCalendar(tinyCalendar());
        const start = { year: 1, month: 1, day: 19 };
        const moved = cal.addDays(start, 2);
        expect(moved.year).toBe(2);
        expect(moved.month).toBe(0);
        expect(moved.day).toBe(1);
        expect(cal.diffDays(start, moved)).toBe(2);
    });

    it("weekdayOf cycles from the anchor and handles negatives", () => {
        const cal = compileCalendar(
            tinyCalendar({ weekdays: ["A", "B", "C"], weekdayAnchor: 1 }),
        );
        expect(cal.weekdayOf(0)).toBe(1);
        expect(cal.weekdayOf(1)).toBe(2);
        expect(cal.weekdayOf(2)).toBe(0);
        expect(cal.weekdayOf(-1)).toBe(0);
        const noWeek = compileCalendar(tinyCalendar());
        expect(noWeek.weekdayOf(0)).toBeNull();
    });

    it("resolves eras with directions", () => {
        const cal = compileCalendar(
            tinyCalendar({
                eras: [
                    {
                        name: "Before",
                        abbreviation: "BF",
                        startYear: null,
                        endYear: -1,
                        direction: -1,
                    },
                    {
                        name: "After",
                        abbreviation: "AF",
                        startYear: 1,
                        endYear: null,
                        direction: 1,
                    },
                ],
            }),
        );
        expect(cal.eraOf(5)).toEqual({
            era: expect.objectContaining({ name: "After" }),
            eraYear: 5,
        });
        expect(cal.eraOf(-1)?.eraYear).toBe(1);
        expect(cal.eraOf(-10)?.eraYear).toBe(10);
    });

    it("era year counting skips the missing year 0 inside one era", () => {
        // One era spanning the year-0 gap: years -2,-1,1,2 with start -2.
        const cal = compileCalendar(
            tinyCalendar({
                eras: [
                    {
                        name: "Span",
                        abbreviation: "SP",
                        startYear: -2,
                        endYear: null,
                        direction: 1,
                    },
                ],
            }),
        );
        expect(cal.eraOf(-2)?.eraYear).toBe(1);
        expect(cal.eraOf(-1)?.eraYear).toBe(2);
        expect(cal.eraOf(1)?.eraYear).toBe(3); // NOT 4 — there is no year 0
        expect(cal.eraOf(2)?.eraYear).toBe(4);
    });

    it("returns null for years outside any era", () => {
        const cal = compileCalendar(
            tinyCalendar({
                eras: [
                    {
                        name: "A",
                        abbreviation: "A",
                        startYear: 10,
                        endYear: null,
                        direction: 1,
                    },
                ],
            }),
        );
        expect(cal.eraOf(5)).toBeNull();
    });
});

describe("format", () => {
    const eras = [
        {
            name: "Age of Fire",
            abbreviation: "AF",
            startYear: 1,
            endYear: null,
            direction: 1 as const,
        },
    ];

    it("formats full dates in each style", () => {
        const cal = compileCalendar(tinyCalendar({ eras }));
        const d = { year: 312, month: 1, day: 12 };
        expect(cal.format(d, "long")).toBe("12 Second, 312 AF");
        expect(cal.format(d, "short")).toBe("12 Second 312 AF");
        expect(cal.format(d, "numeric")).toBe("312.02.12 AF");
    });

    it("omits missing precision naturally", () => {
        const cal = compileCalendar(tinyCalendar({ eras }));
        expect(cal.format({ year: 312 }, "long")).toBe("312 AF");
        expect(cal.format({ year: 312, month: 1 }, "long")).toBe(
            "Second, 312 AF",
        );
    });

    it("appends time of day when present", () => {
        const cal = compileCalendar(tinyCalendar({ eras }));
        expect(
            cal.format(
                { year: 312, month: 1, day: 12, hour: 9, minute: 5 },
                "short",
            ),
        ).toBe("12 Second 312 AF 09:05");
    });

    it("falls back to the bare year outside any era", () => {
        const cal = compileCalendar(tinyCalendar());
        expect(cal.format({ year: -45 }, "long")).toBe("Year -45");
        expect(cal.format({ year: -45 }, "numeric")).toBe("-45");
    });

    it("uses era-relative years for countdown eras", () => {
        const cal = compileCalendar(
            tinyCalendar({
                eras: [
                    {
                        name: "Before Fire",
                        abbreviation: "BF",
                        startYear: null,
                        endYear: -1,
                        direction: -1,
                    },
                ],
            }),
        );
        expect(cal.format({ year: -10 }, "short")).toBe("10 BF");
    });
});
