/**
 * @file Manages user-defined CSS snippets.
 *
 * Snippets are `.css` files in `<vault>/.chronicler/snippets/`. Each
 * *enabled* snippet is injected as a dedicated `<style>` element in
 * `<head>`, letting the user reuse CSS classes across notes
 * (e.g. `.stat-block`) instead of repeating inline styles in every
 * note.
 *
 */

import { writable } from "svelte/store";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { listSnippets, readSnippet, setSnippetEnabled } from "./commands";
import type { Snippet } from "./bindings";
import { log } from "./logger";

/** Attribute used to tag (and later find) our injected `<style>` elements. */
const SNIPPET_ATTR = "data-css-snippet";

/** Reactive list of snippet files with their enabled state (drives the UI). */
export const snippets = writable<Snippet[]>([]);

/** filename -> the `<style>` element currently injected for it. */
const injected = new Map<string, HTMLStyleElement>();

let unlisten: UnlistenFn | null = null;

/**
 * Injects (or updates in place) the `<style>` element for a snippet.
 *
 * SECURITY: `textContent` is the ONLY sink used here — see the file header.
 * Never swap this for innerHTML or any HTML-parsing API.
 */
function applyCss(filename: string, css: string): void {
    if (typeof document === "undefined") return; // SSR/prerender guard.

    let el = injected.get(filename);
    if (!el) {
        el = document.createElement("style");
        el.setAttribute(SNIPPET_ATTR, filename);
        document.head.appendChild(el);
        injected.set(filename, el);
    }
    // Assigning textContent keeps the payload parsed strictly as CSS.
    el.textContent = css;
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
 * no longer enabled or no longer present is removed. Runs on init and on every
 * `snippets-changed` event (live reload).
 */
async function refresh(): Promise<void> {
    let list: Snippet[];
    try {
        list = await listSnippets();
    } catch (e) {
        log.error("Failed to list CSS snippets", e, "snippets");
        return;
    }

    const enabled = list.filter((s) => s.enabled);
    const enabledNames = new Set(enabled.map((s) => s.filename));

    // Drop any injected snippet that is no longer enabled/present.
    for (const filename of [...injected.keys()]) {
        if (!enabledNames.has(filename)) removeCss(filename);
    }

    // (Re-)apply every enabled snippet with its current contents.
    await Promise.all(
        enabled.map(async (s) => {
            try {
                const css = await readSnippet(s.filename);
                applyCss(s.filename, css);
            } catch (e) {
                log.error(
                    `Failed to load CSS snippet '${s.filename}'`,
                    e,
                    "snippets",
                );
                removeCss(s.filename);
            }
        }),
    );

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
 * The store update is only ever optimistic UI. Persistence still happens after
 * the CSS is applied, so a failed enable never records "on" for a snippet with
 * no CSS, and a rollback always leaves config, store, and DOM consistent.
 */
export async function setEnabled(
    filename: string,
    enabled: boolean,
): Promise<void> {
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

/** Re-scans the snippet list (e.g. when the settings panel is opened). */
export async function refreshSnippets(): Promise<void> {
    await refresh();
}

/**
 * Loads and applies enabled snippets for the freshly-opened vault, and starts
 * listening for on-disk changes (live reload). Idempotent across vault swaps.
 */
export async function initializeSnippets(): Promise<void> {
    if (unlisten) {
        unlisten();
        unlisten = null;
    }
    // Install the listener *before* the initial refresh so a change that lands
    // mid-startup isn't dropped — it just schedules a follow-up refresh. The
    // reconcile is idempotent, so a concurrent refresh converges harmlessly.
    unlisten = await listen("snippets-changed", () => {
        refresh();
    });
    await refresh();
}

/** Tears down all injected snippets and the change listener (vault close). */
export function destroySnippets(): void {
    if (unlisten) {
        unlisten();
        unlisten = null;
    }
    for (const filename of [...injected.keys()]) removeCss(filename);
    snippets.set([]);
}
