/**
 * @file Built-in calendars: real-world Gregorian and "Valdrun", an original
 * fantasy example demonstrating custom months, leap rules, eras, and a
 * six-day week. Presets are available in every vault without being written
 * to `.chronicler/calendars/`; saving an edited copy writes a vault file.
 */
import type { CalendarDef } from "./calendarModels";

export const GREGORIAN: CalendarDef = {
    version: 1,
    id: "gregorian",
    name: "Gregorian",
    months: [
        { name: "January", days: 31 },
        { name: "February", days: 28 },
        { name: "March", days: 31 },
        { name: "April", days: 30 },
        { name: "May", days: 31 },
        { name: "June", days: 30 },
        { name: "July", days: 31 },
        { name: "August", days: 31 },
        { name: "September", days: 30 },
        { name: "October", days: 31 },
        { name: "November", days: 30 },
        { name: "December", days: 31 },
    ],
    leapRules: [
        {
            monthIndex: 1,
            extraDays: 1,
            everyYears: 4,
            exceptEveryYears: 100,
            unlessEveryYears: 400,
        },
    ],
    eras: [
        {
            name: "Before Common Era",
            abbreviation: "BCE",
            startYear: null,
            endYear: -1,
            direction: -1,
        },
        {
            name: "Common Era",
            abbreviation: "CE",
            startYear: 1,
            endYear: null,
            direction: 1,
        },
    ],
    weekdays: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ],
    // Proleptic Gregorian Jan 1, 1 CE (serial 0) is a Monday.
    weekdayAnchor: 0,
    hasYearZero: false,
};

export const VALDRUN: CalendarDef = {
    version: 1,
    id: "valdrun",
    name: "Valdrun Reckoning",
    months: [
        { name: "Thawmarch", days: 45 },
        { name: "Seedfall", days: 45 },
        { name: "Highsun", days: 45 },
        { name: "Emberwane", days: 45 },
        { name: "Harvestide", days: 45 },
        { name: "Mistrise", days: 45 },
        { name: "Frostgate", days: 45 },
        { name: "Deepnight", days: 45 },
    ],
    leapRules: [{ monthIndex: 7, extraDays: 1, everyYears: 4 }],
    eras: [
        {
            name: "Before the Concord",
            abbreviation: "BC",
            startYear: null,
            endYear: -1,
            direction: -1,
        },
        {
            name: "Age of the Concord",
            abbreviation: "AC",
            startYear: 1,
            endYear: null,
            direction: 1,
        },
    ],
    weekdays: [
        "Kinday",
        "Forgeday",
        "Tideday",
        "Wardday",
        "Hearthday",
        "Stillday",
    ],
    weekdayAnchor: 0,
    hasYearZero: false,
};

export const CALENDAR_PRESETS: CalendarDef[] = [GREGORIAN, VALDRUN];
