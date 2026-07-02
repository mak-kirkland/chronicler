# Translating Chronicler

Chronicler's interface can be translated by the community. Translations are
plain JSON files that ship inside the app — adding or improving one is a
normal pull request, no coding required.

## How it works

- Every UI string lives in [`src/lib/i18n/locales/en.json`](src/lib/i18n/locales/en.json)
  (English is the source of truth).
- Each language is one file in the same folder, named by its
  [BCP 47 language code](https://en.wikipedia.org/wiki/IETF_language_tag):
  `pl.json` (Polish), `de.json` (German), `pt-br.json` (Brazilian
  Portuguese), …
- Users pick their language in **Settings → Language**. By default the app
  follows the operating system's language.
- **Partial translations are fine.** Any key missing from your file simply
  shows in English. You can translate the most visible parts first and grow
  the file over time.

## Adding a new language

1. Copy `src/lib/i18n/locales/en.json` to `<code>.json` in the same folder.
2. Set the `$meta.name` field to your language's name _in that language_
   (the endonym) — this is what appears in the language dropdown:

    ```json
    { "$meta": { "name": "Deutsch" } }
    ```

3. Translate the values. **Never change the keys** (the left-hand side).
4. Open a pull request. The test suite checks your file automatically.

## Placeholders

Text in curly braces is replaced with a live value at runtime. Keep the
placeholder name exactly as in English, but move it wherever your language
needs it:

```json
"about.version": "Version {version}"          // en
"about.version": "Wersja {version}"           // pl
```

## Plurals

Entries whose value is an object are plural forms, selected by the `count`
placeholder using your language's official plural rules
([CLDR](https://www.unicode.org/cldr/charts/45/supplemental/language_plural_rules.html)).
Provide the categories your language uses — English needs `one`/`other`,
Polish needs `one`/`few`/`many`, and so on:

```json
"importer.filesImported": {
    "one": "Zaimportowano {count} plik!",
    "few": "Zaimportowano {count} pliki!",
    "many": "Zaimportowano {count} plików!"
}
```

`other` is the universal fallback; if a category is missing, `other` is used.

## Checking your work

```bash
pnpm install
pnpm test          # validates all locale files against en.json
pnpm tauri dev     # run the app and pick your language in Settings
```

The validation test rejects unknown keys (usually typos) and placeholders
that don't exist in the English string — the two most common mistakes.
