import { describe, it, expect } from "vitest";
import { GREGORIAN, VALDRUN, CALENDAR_PRESETS } from "./calendarPresets";
import { compileCalendar, validateCalendar } from "./calendar";

describe("calendar presets", () => {
    it("every preset validates", () => {
        for (const preset of CALENDAR_PRESETS) {
            expect(validateCalendar(preset)).toEqual([]);
        }
    });

    it("Gregorian golden dates", () => {
        const cal = compileCalendar(GREGORIAN);
        // 2000 was a leap year (unless-every-400), 1900 was not.
        expect(cal.daysInYear(2000)).toBe(366);
        expect(cal.daysInYear(1900)).toBe(365);
        expect(cal.daysInMonth(2024, 1)).toBe(29);
        // Proleptic Gregorian: Jan 1, 1 CE is a Monday (weekday index 0)
        // and Jan 1, 2000 is a Saturday (weekday index 5).
        expect(cal.weekdayOf(cal.toSerial({ year: 1, month: 0, day: 1 }))).toBe(
            0,
        );
        expect(
            cal.weekdayOf(cal.toSerial({ year: 2000, month: 0, day: 1 })),
        ).toBe(5);
        // Era formatting: BCE counts down, no year zero.
        expect(cal.format({ year: -1 }, "short")).toBe("1 BCE");
        expect(cal.format({ year: 2000, month: 0, day: 1 }, "long")).toBe(
            "1 January, 2000 CE",
        );
    });

    it("Valdrun golden dates", () => {
        const cal = compileCalendar(VALDRUN);
        // 8 months x 45 days = 360-day base year, +1 leap day every 4 years.
        expect(cal.daysInYear(1)).toBe(360);
        expect(cal.daysInYear(4)).toBe(361);
        expect(cal.def.weekdays.length).toBe(6);
    });
});
