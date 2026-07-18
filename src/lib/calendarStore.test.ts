import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./commands", () => ({
    listCalendars: vi.fn(),
    saveCalendar: vi.fn().mockResolvedValue(undefined),
    deleteCalendar: vi.fn().mockResolvedValue(undefined),
}));

import { listCalendars } from "./commands";
import {
    vaultCalendars,
    loadVaultCalendars,
    resolveCalendar,
    allCalendarChoices,
    saveVaultCalendar,
} from "./calendarStore";
import { GREGORIAN, VALDRUN } from "./calendarPresets";
import { tinyCalendar } from "./calendarTestHelpers";

beforeEach(() => {
    vaultCalendars.set(new Map());
    vi.mocked(listCalendars).mockReset();
});

describe("calendarStore", () => {
    it("loads vault calendars, skipping unparseable entries", async () => {
        vi.mocked(listCalendars).mockResolvedValue([
            JSON.stringify(tinyCalendar({ id: "mine" })),
            "{ corrupt",
        ]);
        await loadVaultCalendars();
        expect(resolveCalendar("mine")?.id).toBe("mine");
    });

    it("falls back to presets and lets vault files shadow them", async () => {
        expect(resolveCalendar("gregorian")).toEqual(GREGORIAN);
        vi.mocked(listCalendars).mockResolvedValue([
            JSON.stringify(
                tinyCalendar({ id: "gregorian", name: "House Rules" }),
            ),
        ]);
        await loadVaultCalendars();
        expect(resolveCalendar("gregorian")?.name).toBe("House Rules");
    });

    it("resolveCalendar returns null for unknown ids", () => {
        expect(resolveCalendar("nope")).toBeNull();
    });

    it("allCalendarChoices lists vault + non-shadowed presets", async () => {
        vi.mocked(listCalendars).mockResolvedValue([
            JSON.stringify(tinyCalendar({ id: "mine", name: "Mine" })),
        ]);
        await loadVaultCalendars();
        const ids = allCalendarChoices().map((c) => c.id);
        expect(ids).toContain("mine");
        expect(ids).toContain(GREGORIAN.id);
        expect(ids).toContain(VALDRUN.id);
    });

    it("saveVaultCalendar rejects invalid definitions before any IPC", async () => {
        await expect(
            saveVaultCalendar(tinyCalendar({ months: [] })),
        ).rejects.toThrow();
    });
});
