/**
 * @file Confines user-authored CSS to the note-content container.
 *
 * Snippets are user CSS, but they should style *notes*, not the app shell —
 * the same discipline `src/preview.css` already follows for the app's own
 * note styling. This module rewrites every selector in a snippet so it can
 * only match inside `.chronicler-note`.
 *
 * It is a deliberate string transform rather than a CSSOM round-trip. Reading
 * back `sheet.cssRules` would silently drop any syntax the running engine
 * doesn't recognise, and on Linux the webview is the *system* WebKitGTK, whose
 * version we don't control. Rewriting the text leaves unknown syntax intact and
 * lets the engine deal with it natively, so a snippet degrades the same way it
 * would in a browser instead of vanishing.
 *
 * Prefixing rather than `@scope` is also deliberate. `@scope` contributes no
 * specificity, so a snippet's `h1 { … }` would lose to `preview.css`'s
 * `.chronicler-content h1 { … }` and silently do nothing. A prefixed
 * `.chronicler-note h1` ties on specificity and wins on source order, because
 * snippet stylesheets are appended last.
 *
 * Scoping is a guardrail, not a sandbox: it stops a snippet from *selecting*
 * shell elements, but CSS can still escape visually (e.g. `position: fixed`
 * paints against the viewport). The trust warning in the UI still applies.
 */

/**
 * The container selector every snippet rule is confined to.
 *
 * Deliberately *not* `.chronicler-content`. That class is `preview.css`'s root
 * and carries full article typography, so putting it on compact surfaces (hover
 * popups, canvas cards) would resize their headings. `.chronicler-note` carries
 * no styling of its own — it only marks "this subtree is rendered note content"
 * — so it can be applied everywhere notes render without any visual change.
 */
export const SCOPE_SELECTOR = ".chronicler-note";

/**
 * At-rules that merely group other rules. The prelude is kept and the block is
 * scoped recursively, so `@media (…) { p { … } }` still scopes the `p`.
 *
 * Every other at-rule is emitted untouched — see `scopeRuleList`.
 */
const GROUPING_AT_RULES = new Set([
    "media",
    "supports",
    "container",
    "layer",
    "scope",
    "document",
]);

// --- Scanning ---------------------------------------------------------------
//
// Braces, commas and semicolons only carry structural meaning outside strings
// and comments. The four helpers below are the only code that knows this; every
// transform further down is written in terms of them and never walks raw
// characters itself.

/** Index just past the string literal at `i`, or `i` if none starts there. */
function skipString(css: string, i: number): number {
    const quote = css[i];
    if (quote !== '"' && quote !== "'") return i;

    for (let j = i + 1; j < css.length; j++) {
        if (css[j] === "\\") {
            j++; // Escape: whatever follows is literal, quote included.
        } else if (css[j] === quote) {
            return j + 1;
        }
    }
    return css.length; // Unterminated: consume the remainder.
}

/** Index just past the comment at `i`, or `i` if none starts there. */
function skipComment(css: string, i: number): number {
    if (css[i] !== "/" || css[i + 1] !== "*") return i;
    const end = css.indexOf("*/", i + 2);
    return end === -1 ? css.length : end + 2; // Unterminated: to the end.
}

/** Index of the next character that is neither whitespace nor a comment. */
function skipTrivia(css: string, i: number): number {
    while (i < css.length) {
        if (/\s/.test(css[i])) {
            i++;
            continue;
        }
        const afterComment = skipComment(css, i);
        if (afterComment === i) return i;
        i = afterComment;
    }
    return i;
}

/**
 * Index of the first character of `stop` at or after `from`, ignoring any that
 * fall inside a string or comment. Returns `css.length` when none is found.
 */
function scanTo(css: string, from: number, stop: string): number {
    let i = from;
    while (i < css.length) {
        const afterString = skipString(css, i);
        if (afterString > i) {
            i = afterString;
            continue;
        }
        const afterComment = skipComment(css, i);
        if (afterComment > i) {
            i = afterComment;
            continue;
        }
        if (stop.includes(css[i])) return i;
        i++;
    }
    return css.length;
}

/**
 * Index of the `}` closing the block whose `{` is at `open`. Returns
 * `css.length` when the block is never closed, so unbalanced input degrades to
 * "the rest of the file is the block" rather than throwing.
 */
function findBlockEnd(css: string, open: number): number {
    let depth = 0;
    let i = open;

    while (i < css.length) {
        i = scanTo(css, i, "{}");
        if (i === css.length) break;
        depth += css[i] === "{" ? 1 : -1;
        if (depth === 0) return i;
        i++;
    }
    return css.length;
}

/** Sticky so the name can be read in place, without slicing the remainder. */
const AT_RULE_NAME = /@([-\w]+)/y;

/** The at-rule keyword at `at` (which points at `@`), lowercased. */
function atRuleName(css: string, at: number): string {
    AT_RULE_NAME.lastIndex = at;
    const match = AT_RULE_NAME.exec(css);
    return match ? match[1].toLowerCase() : "";
}

// --- Transforms -------------------------------------------------------------

/**
 * Splits a selector list on top-level commas. Commas nested inside `:is(…)`,
 * `:not(…)`, an attribute value, or a string are not separators.
 */
export function splitSelectorList(selectorText: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    let i = 0;

    while (i < selectorText.length) {
        i = scanTo(selectorText, i, "()[],");
        if (i === selectorText.length) break;

        const c = selectorText[i];
        if (c === "(" || c === "[") depth++;
        else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
        else if (depth === 0) {
            parts.push(selectorText.slice(start, i));
            start = i + 1;
        }
        i++;
    }
    parts.push(selectorText.slice(start));

    return parts.map((p) => p.trim()).filter(Boolean);
}

/** Leading selectors that can never match inside the container. */
const ROOT_PREFIX = /^(?::root|html|body)\b\s*/i;

/**
 * Confines a single selector to the container.
 *
 * A leading `:root` / `html` / `body` is rewritten to the container itself
 * rather than prefixed. That idiom is overwhelmingly how snippets declare
 * custom properties, and a naive prefix would turn it into a selector that
 * matches nothing — silently breaking every `var()` that depends on it.
 */
export function scopeSelector(selector: string): string {
    const trimmed = selector.trim();
    if (!trimmed) return "";

    if (ROOT_PREFIX.test(trimmed)) {
        const rest = trimmed.replace(ROOT_PREFIX, "").trim();
        return rest ? `${SCOPE_SELECTOR} ${rest}` : SCOPE_SELECTOR;
    }
    return `${SCOPE_SELECTOR} ${trimmed}`;
}

/** Confines every selector in a comma-separated list. */
export function scopeSelectorList(selectorText: string): string {
    return splitSelectorList(selectorText).map(scopeSelector).join(", ");
}

/**
 * Rewrites a sequence of rules so each selector is confined to the container.
 * Recurses through grouping at-rules and drops `@import` (a snippet must not be
 * able to pull in further stylesheets).
 */
function scopeRuleList(css: string): string {
    let out = "";
    let i = 0;

    while (i < css.length) {
        // Whitespace and comments between rules are emitted as they are.
        const ruleStart = skipTrivia(css, i);
        out += css.slice(i, ruleStart);
        i = ruleStart;

        // Whatever ends the prelude decides what kind of rule this is.
        const end = scanTo(css, i, "{;}");

        if (end === css.length) {
            out += css.slice(i); // Trailing junk with no block; keep as-is.
            break;
        }

        // A closer with no opener (unbalanced input). Keep it and carry on.
        if (css[end] === "}") {
            out += css.slice(i, end + 1);
            i = end + 1;
            continue;
        }

        // A statement at-rule such as `@import url(…);` — it has no block.
        if (css[end] === ";") {
            const isImport = css[i] === "@" && atRuleName(css, i) === "import";
            if (!isImport) out += css.slice(i, end + 1);
            i = end + 1;
            continue;
        }

        // Otherwise `css[end]` is `{`, so everything before it is the prelude.
        const close = findBlockEnd(css, end);
        const prelude = css.slice(i, end);
        const body = css.slice(end + 1, close);

        if (css[i] === "@") {
            // Grouping at-rules contain rules, so recurse. Everything else —
            // `@keyframes` steps, `@font-face` descriptors, and any at-rule
            // this build has never heard of — is emitted untouched: there are
            // no selectors in there to confine, and guessing would either
            // corrupt valid CSS or silently delete syntax from the future.
            out += GROUPING_AT_RULES.has(atRuleName(css, i))
                ? `${prelude}{${scopeRuleList(body)}}`
                : css.slice(i, close + 1);
        } else {
            const scoped = scopeSelectorList(prelude);
            // A selector list that scopes to nothing can never apply.
            out += scoped ? `${scoped} {${body}}` : "";
        }
        i = close + 1;
    }

    return out;
}

/**
 * Confines an entire snippet stylesheet to the note-content container.
 *
 * Returns the rewritten CSS. Input that fails to parse cleanly is passed
 * through the same transform rather than rejected — a snippet with a stray
 * brace degrades exactly as it would in a browser.
 */
export function scopeCss(css: string): string {
    return scopeRuleList(css);
}
