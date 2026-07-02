/**
 * @file Tiny i18n runtime for Chronicler's UI chrome.
 *
 * Translations are flat-keyed JSON dictionaries in `./locales/*.json`,
 * bundled into the app at build time (nothing is ever fetched — the
 * offline/privacy guarantee holds). `en.json` is the source of truth:
 * every key must exist there, and other locales fall back to English
 * per-key, so a stale community translation can never blank a label.
 *
 * Dictionary entries are either a plain string (with optional
 * `{placeholder}` slots) or a plural-forms object keyed by CLDR plural
 * categories (`one`, `few`, `many`, `other`, …). Plural selection uses
 * the built-in `Intl.PluralRules`, so every language's rules come from
 * the platform — translators only fill in the forms their language uses.
 *
 * Components subscribe via the derived `t` store (`{$t("key")}`), so the
 * whole UI re-renders in place when the language changes — no restart.
 * Persistence of the user's choice lives in `settingsStore`, not here.
 */

import { readable, writable, derived, get } from "svelte/store";

// --- Types ---

/** Values substituted into `{placeholder}` slots. `count` also drives plurals. */
export type TranslationParams = Record<string, string | number>;

/** Per-CLDR-category forms, e.g. `{ "one": "{count} file", "other": "{count} files" }`. */
type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;

/** Info about the language itself, under the reserved `$meta` key. */
export interface LocaleMeta {
    /** The language's name in that language (endonym), e.g. "Polski". */
    name: string;
}

/** A parsed locale file: flat dot-separated keys → string or plural forms. */
export type LocaleDict = {
    $meta?: LocaleMeta;
} & Record<string, string | PluralForms | LocaleMeta | undefined>;

/** The translate function exposed through the `t` store. */
export type TranslateFn = (key: string, params?: TranslationParams) => string;

/** Sentinel preference meaning "follow the OS language". */
export const SYSTEM_LOCALE = "system";

// --- Pure core (unit-tested directly) ---

/** Cached per-locale plural rules; construction is not free. */
const pluralRulesCache = new Map<string, Intl.PluralRules>();

function getPluralRules(locale: string): Intl.PluralRules {
    let rules = pluralRulesCache.get(locale);
    if (!rules) {
        try {
            rules = new Intl.PluralRules(locale);
        } catch {
            rules = new Intl.PluralRules("en");
        }
        pluralRulesCache.set(locale, rules);
    }
    return rules;
}

/** Substitutes `{name}` slots; unknown placeholders are left intact. */
function interpolate(template: string, params?: TranslationParams): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
    );
}

/**
 * Resolves one dictionary entry to a template string, or undefined if the
 * entry can't produce one (e.g. a plural object missing the needed form —
 * the caller then falls back to the English entry for this key).
 */
function pickForm(
    entry: LocaleDict[string],
    locale: string,
    params?: TranslationParams,
): string | undefined {
    if (typeof entry === "string") return entry;
    if (entry === undefined) return undefined;
    const forms = entry as PluralForms;
    const count = params?.count;
    const category =
        typeof count === "number"
            ? getPluralRules(locale).select(count)
            : "other";
    return forms[category] ?? forms.other;
}

/**
 * Builds a translate function over a set of dictionaries with the active
 * locale fixed. Fallback chain per key: active locale → `fallback`
 * (English) → the key itself.
 */
export function createTranslator(
    dictionaries: Record<string, LocaleDict>,
    locale: string,
    fallback = "en",
): TranslateFn {
    const active = dictionaries[locale] ?? dictionaries[fallback];
    const english = dictionaries[fallback];
    return (key, params) => {
        let template = pickForm(active?.[key], locale, params);
        if (template === undefined && english !== active) {
            template = pickForm(english?.[key], fallback, params);
        }
        if (template === undefined) {
            if (import.meta.env?.DEV) {
                console.warn(`[i18n] Missing translation key: "${key}"`);
            }
            return key;
        }
        return interpolate(template, params);
    };
}

/**
 * Turns the persisted preference plus the OS language tag into a concrete
 * locale code. `"system"` matches the OS tag (exact, then base language:
 * `pl-PL` → `pl`), defaulting to English when nothing matches.
 */
export function resolveLocale(
    preference: string,
    systemTag: string | undefined,
    available: string[],
): string {
    if (preference !== SYSTEM_LOCALE && available.includes(preference)) {
        return preference;
    }
    if (systemTag) {
        const tag = systemTag.toLowerCase();
        if (available.includes(tag)) return tag;
        const base = tag.split("-")[0];
        if (available.includes(base)) return base;
    }
    return "en";
}

// --- Locale catalog (bundled at build time) ---

const localeModules = import.meta.glob("./locales/*.json", {
    eager: true,
    import: "default",
}) as Record<string, LocaleDict>;

const dictionaries: Record<string, LocaleDict> = {};
for (const [path, dict] of Object.entries(localeModules)) {
    const code = path.match(/([\w-]+)\.json$/)?.[1]?.toLowerCase();
    if (code) dictionaries[code] = dict;
}

const availableCodes = Object.keys(dictionaries);

/** Languages the app ships with, English first, for the settings dropdown. */
export const availableLocales = readable(
    availableCodes
        .sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)))
        .map((code) => ({
            code,
            name: dictionaries[code].$meta?.name ?? code,
        })),
);

// --- Reactive state ---

function detectSystemTag(): string | undefined {
    return typeof navigator !== "undefined" ? navigator.language : undefined;
}

/**
 * The locale the "system" preference currently resolves to — used by the
 * settings UI to label the "System default (…)" option.
 */
export function systemLocaleCode(): string {
    return resolveLocale(SYSTEM_LOCALE, detectSystemTag(), availableCodes);
}

/** The persisted choice: `"system"` or an explicit locale code. */
export const languagePreference = writable<string>(SYSTEM_LOCALE);

/** The concrete locale code currently in effect (e.g. `"en"`, `"pl"`). */
export const locale = derived(languagePreference, (pref) =>
    resolveLocale(pref, detectSystemTag(), availableCodes),
);

/**
 * The translate function as a store: use `{$t("key")}` in templates for
 * reactive strings, or `get(t)("key")` from plain TS at call time.
 */
export const t = derived(locale, (code) =>
    createTranslator(dictionaries, code),
);

/**
 * Call-time translation for plain `.ts` modules (toasts, context menus,
 * dialogs) where the `$t` store syntax isn't available. Strings built this
 * way are evaluated when the code runs, so they always use the current
 * locale — they just aren't reactive, which is fine for one-shot text.
 */
export function translate(key: string, params?: TranslationParams): string {
    return get(t)(key, params);
}

/**
 * Applies a language preference (`"system"` or a locale code). Persistence
 * is the caller's job (`settingsStore.setAppLanguage`) so this module stays
 * dependency-free.
 */
export function setLanguagePreference(preference: string): void {
    languagePreference.set(preference);
}

// Keep <html lang="…"> in sync so the WebView hyphenates/spellchecks
// correctly (and so Phase 2's dir="rtl" has an obvious home).
locale.subscribe((code) => {
    if (typeof document !== "undefined") {
        document.documentElement.lang = code;
    }
});
