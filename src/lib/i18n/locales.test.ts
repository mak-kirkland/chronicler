/**
 * @file Validates every locale file against `en.json` (the source of truth).
 *
 * This is the safety net for community translation PRs:
 *  - a locale may only contain keys that exist in English (typos surface
 *    as failures instead of silently dead translations),
 *  - placeholders like `{count}` must match the English ones, so a mangled
 *    `{cout}` can't ship,
 *  - every locale must declare its display name in `$meta.name`.
 *
 * Missing keys are deliberately allowed — the runtime falls back to English
 * per-key, so partial translations are valid and expected while a community
 * translation catches up with new features.
 */

import { describe, it, expect } from "vitest";
import type { LocaleDict } from "./index";

const localeModules = import.meta.glob("./locales/*.json", {
    eager: true,
    import: "default",
}) as Record<string, LocaleDict>;

const locales = Object.fromEntries(
    Object.entries(localeModules).map(([path, dict]) => [
        path.match(/([\w-]+)\.json$/)![1],
        dict,
    ]),
);

const en = locales.en;

/** Translation entries of a dict, without the reserved `$meta` block. */
function entriesOf(dict: LocaleDict): [string, unknown][] {
    return Object.entries(dict).filter(([key]) => key !== "$meta");
}

/** All `{placeholder}` names appearing in an entry (string or plural forms). */
function placeholdersOf(entry: unknown): Set<string> {
    const out = new Set<string>();
    const scan = (s: string) => {
        for (const m of s.matchAll(/\{(\w+)\}/g)) out.add(m[1]);
    };
    if (typeof entry === "string") scan(entry);
    else if (entry && typeof entry === "object") {
        for (const form of Object.values(entry)) {
            if (typeof form === "string") scan(form);
        }
    }
    return out;
}

describe("en.json (source of truth)", () => {
    it("exists and declares $meta.name", () => {
        expect(en).toBeDefined();
        expect(en.$meta?.name).toBeTruthy();
    });

    it("has no empty values", () => {
        for (const [key, value] of entriesOf(en)) {
            if (typeof value === "string") {
                expect(value.length, `"${key}" is empty`).toBeGreaterThan(0);
            }
        }
    });

    it("plural entries always provide 'other' (the universal fallback)", () => {
        for (const [key, value] of entriesOf(en)) {
            if (value && typeof value === "object") {
                expect(
                    (value as Record<string, string>).other,
                    `plural entry "${key}" is missing the "other" form`,
                ).toBeTruthy();
            }
        }
    });
});

// A plain loop rather than describe.each: .each throws on an empty table,
// and the catalog legitimately ships English-only until community
// translations land.
for (const code of Object.keys(locales).filter((c) => c !== "en")) {
    describe(`locale ${code}`, () => {
        const dict = locales[code];

        it("declares its display name in $meta.name", () => {
            expect(dict.$meta?.name).toBeTruthy();
        });

        it("contains no unknown keys (typos against en.json)", () => {
            const unknown = entriesOf(dict)
                .map(([key]) => key)
                .filter((key) => !(key in en));
            expect(unknown, `unknown keys: ${unknown.join(", ")}`).toEqual([]);
        });

        it("never invents placeholders that English doesn't have", () => {
            for (const [key, value] of entriesOf(dict)) {
                if (!(key in en)) continue; // covered by the unknown-keys test
                const allowed = placeholdersOf(en[key]);
                for (const name of placeholdersOf(value)) {
                    expect(
                        allowed.has(name),
                        `"${key}" uses {${name}} which en.json doesn't define`,
                    ).toBe(true);
                }
            }
        });

        it("has no empty translations (delete the key to fall back instead)", () => {
            for (const [key, value] of entriesOf(dict)) {
                if (typeof value === "string") {
                    expect(
                        value.length,
                        `"${key}" is empty — remove it to use the English fallback`,
                    ).toBeGreaterThan(0);
                }
            }
        });
    });
}
