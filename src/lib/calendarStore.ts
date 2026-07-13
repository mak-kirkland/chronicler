/**
 * @file The vault's calendar collection: files from `.chronicler/calendars/`
 * merged over the built-in presets (a vault file with a preset's id shadows
 * it). Calendars are parsed and validated HERE, in the frontend engine —
 * the backend stores opaque JSON.
 */
import { writable, get } from "svelte/store";
import {
    listCalendars,
    saveCalendar as saveCalendarCmd,
    deleteCalendar as deleteCalendarCmd,
} from "./commands";
import type { CalendarDef } from "./calendarModels";
import { validateCalendar, CalendarValidationError } from "./calendar";
import { CALENDAR_PRESETS } from "./calendarPresets";
import { log } from "./logger";

export const vaultCalendars = writable<Map<string, CalendarDef>>(new Map());

export async function loadVaultCalendars(): Promise<void> {
    try {
        const jsons = await listCalendars();
        const map = new Map<string, CalendarDef>();
        for (const json of jsons) {
            try {
                const def = JSON.parse(json) as CalendarDef;
                if (typeof def?.id === "string") map.set(def.id, def);
            } catch (e) {
                log.warn(
                    `Skipping unparseable calendar file: ${e}`,
                    "calendarStore",
                );
            }
        }
        vaultCalendars.set(map);
    } catch (e) {
        log.error("Failed to list vault calendars", e, "calendarStore");
    }
}

/** Vault file first, then built-in preset, then null. */
export function resolveCalendar(id: string): CalendarDef | null {
    const vault = get(vaultCalendars).get(id);
    if (vault) return vault;
    return CALENDAR_PRESETS.find((p) => p.id === id) ?? null;
}

/** Every selectable calendar: vault files + presets they don't shadow. */
export function allCalendarChoices(): CalendarDef[] {
    const vault = get(vaultCalendars);
    const out = [...vault.values()];
    for (const preset of CALENDAR_PRESETS) {
        if (!vault.has(preset.id)) out.push(preset);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Validates, persists, and merges one calendar into the store. */
export async function saveVaultCalendar(def: CalendarDef): Promise<void> {
    const errors = validateCalendar(def);
    if (errors.length > 0) throw new CalendarValidationError(errors);
    await saveCalendarCmd(def.id, JSON.stringify(def, null, 2));
    vaultCalendars.update((m) => {
        const next = new Map(m);
        next.set(def.id, def);
        return next;
    });
}

export async function removeVaultCalendar(id: string): Promise<void> {
    await deleteCalendarCmd(id);
    vaultCalendars.update((m) => {
        const next = new Map(m);
        next.delete(id);
        return next;
    });
}
