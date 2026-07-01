import { describe, it, expect } from "vitest";
import {
    scopeCss,
    scopeSelector,
    scopeSelectorList,
    splitSelectorList,
    SCOPE_SELECTOR,
} from "./cssScope";

/** Collapses whitespace so assertions describe structure, not formatting. */
const norm = (css: string) => css.replace(/\s+/g, " ").trim();

describe("splitSelectorList", () => {
    it("splits on top-level commas", () => {
        expect(splitSelectorList("h1, h2 , h3")).toEqual(["h1", "h2", "h3"]);
    });

    it("ignores commas nested in :is() / :not()", () => {
        expect(splitSelectorList(":is(h1, h2) p, blockquote")).toEqual([
            ":is(h1, h2) p",
            "blockquote",
        ]);
    });

    it("ignores commas inside attribute values and strings", () => {
        expect(splitSelectorList('[data-x="a,b"], p')).toEqual([
            '[data-x="a,b"]',
            "p",
        ]);
    });

    it("drops empty entries from trailing or doubled commas", () => {
        expect(splitSelectorList("p,, ,")).toEqual(["p"]);
    });
});

describe("scopeSelector", () => {
    it("prefixes an ordinary selector", () => {
        expect(scopeSelector(".stat-block")).toBe(
            `${SCOPE_SELECTOR} .stat-block`,
        );
    });

    // The important one: `:root { --x: … }` is how snippets declare custom
    // properties. A naive prefix produces a selector matching nothing, which
    // would silently break every var() depending on it.
    it("rewrites a bare :root to the container itself", () => {
        expect(scopeSelector(":root")).toBe(SCOPE_SELECTOR);
    });

    it("rewrites html and body the same way", () => {
        expect(scopeSelector("html")).toBe(SCOPE_SELECTOR);
        expect(scopeSelector("body")).toBe(SCOPE_SELECTOR);
    });

    it("keeps the remainder when :root leads a descendant selector", () => {
        expect(scopeSelector(":root .foo")).toBe(`${SCOPE_SELECTOR} .foo`);
        expect(scopeSelector("body p")).toBe(`${SCOPE_SELECTOR} p`);
    });

    it("does not treat a class merely starting with 'body' as the body element", () => {
        expect(scopeSelector(".body-text")).toBe(
            `${SCOPE_SELECTOR} .body-text`,
        );
    });
});

describe("scopeSelectorList", () => {
    it("scopes every selector in the list independently", () => {
        expect(scopeSelectorList("h1, .note")).toBe(
            `${SCOPE_SELECTOR} h1, ${SCOPE_SELECTOR} .note`,
        );
    });
});

describe("scopeCss", () => {
    it("confines a simple rule", () => {
        expect(norm(scopeCss("p { margin: 0; }"))).toBe(
            `${SCOPE_SELECTOR} p { margin: 0; }`,
        );
    });

    it("cannot be used to restyle the app shell", () => {
        // The whole point: a snippet targeting shell chrome must end up
        // confined to note content, where it matches nothing.
        const out = scopeCss(".sidebar { display: none; }");
        expect(norm(out)).toBe(`${SCOPE_SELECTOR} .sidebar { display: none; }`);
        expect(out.startsWith(SCOPE_SELECTOR)).toBe(true);
    });

    it("scopes rules nested inside @media", () => {
        const out = scopeCss("@media (min-width: 600px) { p { color: red; } }");
        expect(norm(out)).toBe(
            `@media (min-width: 600px) { ${SCOPE_SELECTOR} p { color: red; } }`,
        );
    });

    it("scopes rules inside nested grouping at-rules", () => {
        const out = scopeCss(
            "@supports (display: grid) { @media print { a { color: blue; } } }",
        );
        expect(out).toContain(`${SCOPE_SELECTOR} a`);
    });

    // Keyframe steps are not selectors; prefixing `from`/`50%` would corrupt
    // the animation.
    it("leaves @keyframes steps untouched", () => {
        const css =
            "@keyframes spin { from { opacity: 0; } to { opacity: 1; } }";
        expect(scopeCss(css)).toBe(css);
        expect(scopeCss(css)).not.toContain(SCOPE_SELECTOR);
    });

    it("leaves @font-face descriptors untouched", () => {
        const css = '@font-face { font-family: "X"; src: url(x.woff2); }';
        expect(scopeCss(css)).toBe(css);
    });

    it("drops @import so a snippet cannot pull in another stylesheet", () => {
        const out = scopeCss('@import url("evil.css"); p { color: red; }');
        expect(out).not.toContain("@import");
        expect(out).toContain(`${SCOPE_SELECTOR} p`);
    });

    it("does not mistake braces inside strings for block boundaries", () => {
        const out = scopeCss('p::after { content: "}"; } .x { color: red; }');
        expect(out).toContain(`${SCOPE_SELECTOR} .x`);
    });

    it("does not treat commas or braces inside comments as structure", () => {
        const out = scopeCss("/* h1, h2 { } */ p { color: red; }");
        expect(out).toContain(`${SCOPE_SELECTOR} p`);
        expect(out).toContain("/* h1, h2 { } */");
    });

    it("scopes each selector of a multi-selector rule", () => {
        const out = scopeCss("h1, h2 { color: red; }");
        expect(norm(out)).toBe(
            `${SCOPE_SELECTOR} h1, ${SCOPE_SELECTOR} h2 { color: red; }`,
        );
    });

    it("passes unknown at-rules through instead of deleting them", () => {
        // Forward compatibility: syntax this build doesn't know about should
        // survive rather than silently vanish.
        const css = "@future-thing { p { color: red; } }";
        expect(scopeCss(css)).toBe(css);
    });

    it("is idempotent enough to survive a double application", () => {
        const once = scopeCss("p { margin: 0; }");
        const twice = scopeCss(once);
        expect(twice).toContain("p { margin: 0; }");
    });

    it("returns empty output for empty input", () => {
        expect(scopeCss("")).toBe("");
    });

    it("tolerates an unbalanced brace without throwing", () => {
        expect(() => scopeCss("p { color: red;")).not.toThrow();
    });

    it("keeps the whole declaration when a block is never closed", () => {
        // The unterminated block runs to the end of the file, so nothing may
        // be trimmed off it on the way out.
        const out = scopeCss("p { color: red;");
        expect(out).toContain("color: red;");
        expect(out).toContain(`${SCOPE_SELECTOR} p`);
    });

    it("does not eat a closing brace when blocks nest inside an unclosed one", () => {
        // Each unclosed level used to consume one more trailing character, so
        // a nested block could lose its real `}` rather than just whitespace.
        const out = scopeCss("@media (x) { p { color: red; @page { a: b } ");
        expect(out).toContain("@page { a: b }");
    });

    it("keeps statement at-rules other than @import", () => {
        const out = scopeCss("@layer base; p { color: red; }");
        expect(out).toContain("@layer base;");
        expect(out).toContain(`${SCOPE_SELECTOR} p`);
    });

    it("does not mistake a semicolon inside a prelude string for a statement", () => {
        const out = scopeCss('[data-x=";"] { color: red; }');
        expect(norm(out)).toBe(
            `${SCOPE_SELECTOR} [data-x=";"] { color: red; }`,
        );
    });
});
