/**
 * @file Unit tests for the i18n runtime: key lookup, {placeholder}
 * interpolation, Intl.PluralRules-based plural selection, the
 * locale → English → key fallback chain, and system-locale resolution.
 */

import { describe, it, expect } from "vitest";
import { get } from "svelte/store";
import { createTranslator, resolveLocale, type LocaleDict } from "./index";
import {
    t,
    languagePreference,
    availableLocales,
    setLanguagePreference,
} from "./index";

// --- Fixture dictionaries (independent of the real locale catalog) ---

const en: LocaleDict = {
    $meta: { name: "English" },
    "settings.title": "Settings",
    "greeting.hello": "Hello, {name}!",
    "importer.imported": {
        one: "{count} file imported",
        other: "{count} files imported",
    },
    "only.in.english": "English only",
};

const pl: LocaleDict = {
    $meta: { name: "Polski" },
    "settings.title": "Ustawienia",
    "greeting.hello": "Cześć, {name}!",
    "importer.imported": {
        one: "{count} plik zaimportowany",
        few: "{count} pliki zaimportowane",
        many: "{count} plików zaimportowanych",
    },
};

const dicts = { en, pl };

describe("createTranslator: lookup and interpolation", () => {
    const tr = createTranslator(dicts, "en");

    it("returns the plain string for a known key", () => {
        expect(tr("settings.title")).toBe("Settings");
    });

    it("interpolates {placeholder} params", () => {
        expect(tr("greeting.hello", { name: "Ada" })).toBe("Hello, Ada!");
    });

    it("leaves unknown placeholders intact rather than dropping them", () => {
        expect(tr("greeting.hello", {})).toBe("Hello, {name}!");
    });

    it("returns the key itself for a completely unknown key", () => {
        expect(tr("does.not.exist")).toBe("does.not.exist");
    });
});

describe("createTranslator: plurals via Intl.PluralRules", () => {
    it("selects one/other for English", () => {
        const tr = createTranslator(dicts, "en");
        expect(tr("importer.imported", { count: 1 })).toBe("1 file imported");
        expect(tr("importer.imported", { count: 5 })).toBe("5 files imported");
    });

    it("selects one/few/many for Polish", () => {
        const tr = createTranslator(dicts, "pl");
        expect(tr("importer.imported", { count: 1 })).toBe(
            "1 plik zaimportowany",
        );
        expect(tr("importer.imported", { count: 2 })).toBe(
            "2 pliki zaimportowane",
        );
        expect(tr("importer.imported", { count: 5 })).toBe(
            "5 plików zaimportowanych",
        );
    });

    it("falls back to 'other' when a category is missing", () => {
        const sparse: LocaleDict = {
            "n.items": { other: "{count} items" },
        };
        const tr = createTranslator({ en: sparse }, "en");
        expect(tr("n.items", { count: 1 })).toBe("1 items");
    });

    it("uses 'other' when no count param is given for a plural entry", () => {
        const tr = createTranslator(dicts, "en");
        expect(tr("importer.imported")).toBe("{count} files imported");
    });
});

describe("createTranslator: fallback chain", () => {
    const tr = createTranslator(dicts, "pl");

    it("uses the active locale when the key exists there", () => {
        expect(tr("settings.title")).toBe("Ustawienia");
    });

    it("falls back to English per-key when the locale lacks the key", () => {
        expect(tr("only.in.english")).toBe("English only");
    });

    it("falls back to the key itself when English lacks it too", () => {
        expect(tr("missing.everywhere")).toBe("missing.everywhere");
    });

    it("never crashes on an unknown active locale (treats it as English)", () => {
        const trUnknown = createTranslator(dicts, "xx");
        expect(trUnknown("settings.title")).toBe("Settings");
    });
});

describe("resolveLocale: preference + system detection", () => {
    const available = ["en", "pl"];

    it("honors an explicit, available preference", () => {
        expect(resolveLocale("pl", "en-US", available)).toBe("pl");
    });

    it("ignores an explicit preference that is not available", () => {
        expect(resolveLocale("de", "en-US", available)).toBe("en");
    });

    it("system: matches the exact system tag when available", () => {
        expect(resolveLocale("system", "pl", available)).toBe("pl");
    });

    it("system: collapses region tags (pl-PL → pl)", () => {
        expect(resolveLocale("system", "pl-PL", available)).toBe("pl");
    });

    it("system: is case-insensitive on the tag", () => {
        expect(resolveLocale("system", "PL-pl", available)).toBe("pl");
    });

    it("system: falls back to English when nothing matches", () => {
        expect(resolveLocale("system", "ja-JP", available)).toBe("en");
    });

    it("system: falls back to English when the tag is missing", () => {
        expect(resolveLocale("system", undefined, available)).toBe("en");
    });
});

describe("module wiring: real locale catalog", () => {
    it("exposes English in availableLocales with a display name", () => {
        const locales = get(availableLocales);
        const en = locales.find((l) => l.code === "en");
        expect(en).toBeDefined();
        expect(en!.name.length).toBeGreaterThan(0);
    });

    it("lists English first", () => {
        expect(get(availableLocales)[0]?.code).toBe("en");
    });

    it("languagePreference defaults to 'system'", () => {
        expect(get(languagePreference)).toBe("system");
    });

    it("$t resolves keys from the real catalog", () => {
        // Live-switching between real locales is covered by the fixture
        // tests above; the catalog currently ships English only.
        setLanguagePreference("en");
        expect(get(t)("settings.title")).toBe("Settings");
        setLanguagePreference("system");
    });
});
