/**
 * @file Adaptive tick generation for the timeline axis. Given a compiled
 * calendar and a serial window, picks the largest unit (minutes -> hours ->
 * days -> months -> stepped years) producing roughly `targetCount` ticks,
 * and generates calendar-aligned tick positions with labels.
 */
import type { CompiledCalendar } from "./calendar";

export interface AxisTick {
    serial: number;
    label: string;
}

export interface EraBand {
    startSerial: number;
    endSerial: number;
    name: string;
}

const YEAR_STEPS = [
    1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000,
    100000, 250000, 500000, 1000000,
];

export function ticks(
    cal: CompiledCalendar,
    startSerial: number,
    endSerial: number,
    targetCount = 10,
): AxisTick[] {
    const span = endSerial - startSerial;
    if (span <= 0) return [];
    const avgYear = cal.daysInYear(1); // close enough for unit selection
    const fit = (unitDays: number) => span / unitDays <= targetCount * 1.4;

    if (fit(1 / 1440)) return timeTicks(cal, startSerial, endSerial, 1 / 1440);
    if (fit(5 / 1440)) return timeTicks(cal, startSerial, endSerial, 5 / 1440);
    if (fit(15 / 1440))
        return timeTicks(cal, startSerial, endSerial, 15 / 1440);
    if (fit(1 / 24)) return timeTicks(cal, startSerial, endSerial, 1 / 24);
    if (fit(3 / 24)) return timeTicks(cal, startSerial, endSerial, 3 / 24);
    if (fit(6 / 24)) return timeTicks(cal, startSerial, endSerial, 6 / 24);
    if (fit(1)) return dayTicks(cal, startSerial, endSerial);
    if (fit(avgYear / cal.monthCount))
        return monthTicks(cal, startSerial, endSerial);
    for (const step of YEAR_STEPS) {
        if (fit(avgYear * step))
            return yearTicks(cal, startSerial, endSerial, step);
    }
    return yearTicks(
        cal,
        startSerial,
        endSerial,
        YEAR_STEPS[YEAR_STEPS.length - 1],
    );
}

function timeTicks(
    cal: CompiledCalendar,
    start: number,
    end: number,
    stepDays: number,
): AxisTick[] {
    const out: AxisTick[] = [];
    let s = Math.ceil(start / stepDays) * stepDays;
    for (; s <= end; s += stepDays) {
        const d = cal.fromSerial(s);
        out.push({
            serial: s,
            label: `${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}`,
        });
    }
    return out;
}

function dayTicks(
    cal: CompiledCalendar,
    start: number,
    end: number,
): AxisTick[] {
    const out: AxisTick[] = [];
    for (let s = Math.ceil(start); s <= end; s += 1) {
        const d = cal.fromSerial(s);
        out.push({
            serial: s,
            label: cal.format(
                { year: d.year, month: d.month, day: d.day },
                "short",
            ),
        });
    }
    return out;
}

function monthTicks(
    cal: CompiledCalendar,
    start: number,
    end: number,
): AxisTick[] {
    const out: AxisTick[] = [];
    let { year, month } = cal.fromSerial(start);
    // Advance to the first month whose start is inside the window.
    for (;;) {
        const s = cal.toSerial({ year, month });
        if (s >= start) break;
        month++;
        if (month >= cal.monthCount) {
            month = 0;
            year = cal.nextYear(year);
        }
    }
    for (;;) {
        const s = cal.toSerial({ year, month });
        if (s > end) break;
        out.push({ serial: s, label: cal.format({ year, month }, "short") });
        month++;
        if (month >= cal.monthCount) {
            month = 0;
            year = cal.nextYear(year);
        }
    }
    return out;
}

function yearTicks(
    cal: CompiledCalendar,
    start: number,
    end: number,
    step: number,
): AxisTick[] {
    const out: AxisTick[] = [];
    let y = Math.ceil(cal.fromSerial(start).year / step) * step;
    if (y === 0 && !cal.def.hasYearZero) y = step >= 1 ? step : 1;
    for (;;) {
        if (y === 0 && !cal.def.hasYearZero) {
            y += step;
            continue;
        }
        const s = cal.yearStartSerial(y);
        if (s > end) break;
        if (s >= start)
            out.push({ serial: s, label: cal.format({ year: y }, "short") });
        y += step;
    }
    return out;
}

export function eraBands(
    cal: CompiledCalendar,
    startSerial: number,
    endSerial: number,
): EraBand[] {
    const out: EraBand[] = [];
    for (const era of cal.def.eras) {
        const bandStart =
            era.startYear == null
                ? -Infinity
                : cal.yearStartSerial(era.startYear);
        const bandEnd =
            era.endYear == null
                ? Infinity
                : cal.yearStartSerial(cal.nextYear(era.endYear));
        const s = Math.max(bandStart, startSerial);
        const e = Math.min(bandEnd, endSerial);
        if (s < e) out.push({ startSerial: s, endSerial: e, name: era.name });
    }
    return out;
}
