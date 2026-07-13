import { describe, it, expect } from "vitest";
import { compileCalendar } from "./calendar";
import { GREGORIAN } from "./calendarPresets";
import { ticks, eraBands } from "./timelineTicks";

const cal = compileCalendar(GREGORIAN);

describe("ticks", () => {
    it("returns roughly targetCount ticks", () => {
        const start = cal.toSerial({ year: 1000 });
        const end = cal.toSerial({ year: 2000 });
        const result = ticks(cal, start, end, 10);
        expect(result.length).toBeGreaterThanOrEqual(5);
        expect(result.length).toBeLessThanOrEqual(20);
    });

    it("year ticks align to round multiples of the step", () => {
        const start = cal.toSerial({ year: 1003 });
        const end = cal.toSerial({ year: 1997 });
        const result = ticks(cal, start, end, 10);
        // 994-year span at ~10 ticks => 100-year step, aligned to centuries.
        expect(result[0].label).toBe("1100 CE");
    });

    it("zooming into a single year yields month ticks", () => {
        const start = cal.toSerial({ year: 2000, month: 0, day: 1 });
        const end = cal.toSerial({ year: 2000, month: 11, day: 31 });
        const result = ticks(cal, start, end, 12);
        expect(result.some((t) => t.label.includes("March"))).toBe(true);
    });

    it("zooming into a few days yields day ticks", () => {
        const start = cal.toSerial({ year: 2000, month: 2, day: 3 });
        const result = ticks(cal, start, start + 7, 8);
        expect(result.some((t) => t.label.includes("March"))).toBe(true);
        expect(result.length).toBeGreaterThanOrEqual(6);
    });

    it("zooming into hours yields time ticks", () => {
        const start = cal.toSerial({ year: 2000, month: 2, day: 3 });
        const result = ticks(cal, start, start + 0.5, 12);
        expect(result.some((t) => /\d{2}:00/.test(t.label))).toBe(true);
    });

    it("every tick serial lies within the window", () => {
        const start = cal.toSerial({ year: 1500 });
        const end = cal.toSerial({ year: 1750 });
        for (const t of ticks(cal, start, end, 10)) {
            expect(t.serial).toBeGreaterThanOrEqual(start);
            expect(t.serial).toBeLessThanOrEqual(end);
        }
    });
});

describe("eraBands", () => {
    it("clamps open-ended eras to the window", () => {
        const start = cal.toSerial({ year: -50 });
        const end = cal.toSerial({ year: 50 });
        const bands = eraBands(cal, start, end);
        expect(bands).toHaveLength(2);
        expect(bands[0].name).toBe("Before Common Era");
        expect(bands[0].startSerial).toBe(start);
        expect(bands[1].name).toBe("Common Era");
        expect(bands[1].endSerial).toBe(end);
        // BCE ends where CE begins: serial 0.
        expect(bands[0].endSerial).toBe(0);
        expect(bands[1].startSerial).toBe(0);
    });

    it("returns nothing for a window outside all eras", () => {
        const noEras = compileCalendar({
            ...GREGORIAN,
            id: "noeras",
            eras: [],
        });
        expect(eraBands(noEras, 0, 1000)).toEqual([]);
    });
});
