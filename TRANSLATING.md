# Translating Chronicler

Chronicler's interface can be translated by the community. Translations are
plain JSON files that ship inside the app.

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

## Submitting your translation

Email your `<code>.json` file to **<michael@chronicler.pro>**.

Please include:

- The language and its code - for example, "German - `de.json`".
- The name or handle you would like to be credited under.
- This line, so that the permission is on record:

    > I wrote this translation myself and I agree to the translation terms in
    > TRANSLATING.md, including that Chronicler may include it in paid versions.

I will add the file to the app, credit you in
[TRANSLATORS.md](TRANSLATORS.md) and in the app's About screen.


## Translation terms

_Version 1.0 — 2 August 2026_

The short version: your translation stays yours, I need permission to ship it,
and you get credited.

Chronicler is free today, and a paid version may exist one day. A translation
is only useful to the project if it can be shipped in both. So by sending me a
translation, you agree to the following.

**What you are giving me.** You give me, Michael Kirkland, permission to use
your translation in Chronicler: to reproduce it, distribute it, communicate it
publicly, and to transform, adapt, translate and correct it - worldwide, for
the full duration of copyright, free of charge, and irrevocably. This
permission can be sub-licensed and transferred, which means I may include your
translation in versions of Chronicler that are sold, and in a company set up to
publish Chronicler later.

**What stays yours.** You keep the copyright in your translation. This is
permission, not a transfer of ownership - you remain free to do whatever else
you like with your own work. Your moral rights as its author are yours and stay
yours. You are simply agreeing not to object to Chronicler editing, correcting,
shortening or combining your translation as the app changes, and to being
credited in a credits list rather than inside the file itself.

**What you are confirming.** That you wrote it. That you are free to give this
permission - if an employment contract assigns your copyright to an employer,
you have their agreement. That you have not copied it from another product's
translations. And that you are 18 or over, or have a parent or guardian's
permission.

**What you are not getting.** No payment: translations are voluntary and
unpaid, and you are not expecting a fee now or in future. No guarantee that I
will use your file, keep it, or leave it unedited.

**Credit.** You will be credited in [TRANSLATORS.md](TRANSLATORS.md) and in the
app's About screen, under whatever name or handle you ask for. If you would
rather not be named at all, say so and I will leave you out.

**Law.** These terms are governed by the law of Spain. If you are a consumer
resident elsewhere in the EU, the mandatory protections of your own country
continue to apply to you.
