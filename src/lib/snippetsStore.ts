/**
 * @file Manages user-defined CSS snippets.
 *
 * Snippets are `.css` files in `<vault>/.chronicler/snippets/`. Each
 * *enabled* snippet is injected as a dedicated `<style>` element in
 * `<head>`, letting the user reuse CSS classes (e.g. `.stat-block`)
 * instead of repeating inline styles in every note.
 *
 * Every rule is rewritten by {@link scopeCss} so it can only match inside the
 * note-content container, mirroring the discipline `src/preview.css` already
 * follows. That keeps a snippet from restyling the sidebar, modals or this
 * feature's own settings panel — the app's own appearance belongs to the theme
 * editor. Scoping is a guardrail rather than a sandbox (CSS can still escape
 * visually via fixed positioning), so the UI's trust warning still stands.
 */

import { writable } from "svelte/store";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { listSnippets, readSnippet, setSnippetEnabled } from "./commands";
import type { Snippet } from "./bindings";
import { scopeCss } from "./cssScope";
import { log } from "./logger";

/** Marks our injected `<style>` elements so they are identifiable in devtools. */
const SNIPPET_ATTR = "data-css-snippet";

/** Reactive list of snippet files with their enabled state (drives the UI). */
export const snippets = writable<Snippet[]>([]);

/** filename -> the `<style>` element currently injected for it. */
const injected = new Map<string, HTMLStyleElement>();

let unlisten: UnlistenFn | null = null;

/**
 * Bumped whenever snippet state is mutated from anywhere. A `refresh` captures
 * it on entry and abandons its own writes if it no longer matches, so a slow
 * refresh can never resurrect state a later toggle (or a vault close) already
 * superseded.
 */
let generation = 0;

/**
 * Injects (or updates in place) the `<style>` element for a snippet, after
 * confining its rules to the note-content container.
 *
 * SECURITY: `textContent` is the ONLY sink used here — see the file header.
 * Never swap this for innerHTML or any HTML-parsing API.
 */
function applyCss(filename: string, css: string): void {
    // Scope before injecting, so the shell-restyling form of the CSS never
    // reaches the document even momentarily.
    const scoped = scopeCss(css);

    let el = injected.get(filename);
    if (!el) {
        el = document.createElement("style");
        el.setAttribute(SNIPPET_ATTR, filename);
        document.head.appendChild(el);
        injected.set(filename, el);
    }
    // Assigning textContent keeps the payload parsed strictly as CSS. Skip the
    // write when nothing changed: every assignment re-parses the stylesheet and
    // invalidates document-wide style, and a single file's change re-runs this
    // for every enabled snippet.
    if (el.textContent !== scoped) el.textContent = scoped;
}

/** Removes a snippet's injected `<style>` element, if present. */
function removeCss(filename: string): void {
    const el = injected.get(filename);
    if (el) {
        el.remove();
        injected.delete(filename);
    }
}

/**
 * Re-reads the snippet list from the backend and reconciles the DOM: every
 * enabled snippet is (re-)applied with its latest file contents, and anything
 * no longer enabled or no longer present is removed. Runs on init, when the
 * settings panel opens, and on every `snippets-changed` event (live reload).
 *
 * All reads complete before anything is touched, and the generation is
 * re-checked immediately beforehand, so a refresh that was overtaken by a
 * toggle or a vault close exits without writing.
 */
export async function refreshSnippets(): Promise<void> {
    const token = ++generation;

    let list: Snippet[];
    try {
        list = await listSnippets();
    } catch (e) {
        log.error("Failed to list CSS snippets", e, "snippets");
        return;
    }

    const enabled = list.filter((s) => s.enabled);

    // Read every enabled snippet in parallel. A failed read yields null, which
    // reconciles below as "remove it".
    const contents = await Promise.all(
        enabled.map(async (s) => {
            try {
                return [s.filename, await readSnippet(s.filename)] as const;
            } catch (e) {
                log.error(
                    `Failed to load CSS snippet '${s.filename}'`,
                    e,
                    "snippets",
                );
                return [s.filename, null] as const;
            }
        }),
    );

    if (token !== generation) return; // Superseded while we were reading.

    const enabledNames = new Set(enabled.map((s) => s.filename));
    for (const filename of [...injected.keys()]) {
        if (!enabledNames.has(filename)) removeCss(filename);
    }
    for (const [filename, css] of contents) {
        if (css === null) removeCss(filename);
        else applyCss(filename, css);
    }

    snippets.set(list);
}

/** Sets the enabled flag for a single snippet in the reactive store. */
function setStoreEnabled(filename: string, enabled: boolean): void {
    snippets.update((list) =>
        list.map((s) => (s.filename === filename ? { ...s, enabled } : s)),
    );
}

/**
 * Toggles a snippet on/off: reflects the choice in the store immediately (so the
 * UI toggle responds instantly), applies/removes the CSS, and persists the
 * choice — rolling the store back if anything fails.
 *
 * The two branches order their steps differently on purpose; see the inline
 * comments. Bumping the generation first stops an in-flight `refreshSnippets`
 * from later overwriting this toggle with the state it read before it.
 */
export async function setEnabled(
    filename: string,
    enabled: boolean,
): Promise<void> {
    generation++;
    setStoreEnabled(filename, enabled);

    try {
        if (enabled) {
            // Apply before persisting: a failed read throws before the config
            // is written, so we never record "on" for a snippet with no CSS.
            const css = await readSnippet(filename);
            applyCss(filename, css);
            await setSnippetEnabled(filename, true);
        } else {
            // Persist before removing: a failed write leaves the CSS applied
            // and the config "on" — a consistent state that self-heals on the
            // next refresh, rather than a live snippet with disabled config.
            await setSnippetEnabled(filename, false);
            removeCss(filename);
        }
    } catch (e) {
        // Roll the optimistic UI change back to reality and undo any partial
        // apply, then let the caller surface the failure.
        setStoreEnabled(filename, !enabled);
        if (enabled) removeCss(filename);
        throw e;
    }
}

/**
 * Loads and applies enabled snippets for the freshly-opened vault, and starts
 * listening for on-disk changes (live reload). Idempotent across vault swaps:
 * the previous vault's snippets are torn down first rather than left for the
 * reconcile to notice.
 */
export async function initializeSnippets(): Promise<void> {
    destroySnippets();
    // Install the listener *before* the initial refresh so a change that lands
    // mid-startup isn't dropped — it just schedules a follow-up refresh, which
    // supersedes the initial one via the generation check.
    unlisten = await listen("snippets-changed", () => {
        refreshSnippets();
    });
    await refreshSnippets();
}

/** Tears down all injected snippets and the change listener (vault close). */
export function destroySnippets(): void {
    // Invalidate any refresh still in flight so it cannot re-inject the CSS we
    // are about to remove.
    generation++;
    if (unlisten) {
        unlisten();
        unlisten = null;
    }
    for (const filename of [...injected.keys()]) removeCss(filename);
    snippets.set([]);
}
