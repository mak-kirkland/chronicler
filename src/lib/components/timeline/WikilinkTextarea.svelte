<script lang="ts">
    import {
        applyWikilinkCompletion,
        wikilinkQueryAt,
    } from "$lib/wikilinkAutocomplete";
    import {
        applyMapNameCompletion,
        mapLinkQuery,
        placeKindKey,
    } from "$lib/mapLinkAutocomplete";
    import { allFileTitles, allMaps, mapPathLookup } from "$lib/worldStore";
    import { getMapConfig, loadMapConfig, loadedMaps } from "$lib/mapStore";
    import { placeLabels } from "$lib/mapUtils";
    import { t } from "$lib/i18n";

    let {
        value = $bindable(),
        rows = 4,
        placeholder = "",
    } = $props<{
        value: string;
        rows?: number;
        placeholder?: string;
    }>();

    let textareaEl = $state<HTMLTextAreaElement | null>(null);
    let token = $state<{ query: string } | null>(null);
    let selectedIndex = $state(0);

    // `[[map:Name#Place]]` being typed: suggest maps, then that map's places.
    const mapQuery = $derived(token ? mapLinkQuery(token.query) : null);
    const placeMapPath = $derived(
        mapQuery?.kind === "place"
            ? ($mapPathLookup.get(mapQuery.map.toLowerCase()) ?? null)
            : null,
    );
    /** A suggestion; places say whether they're a pin or a region. */
    type Suggestion = { label: string; kind?: "pin" | "region" };

    // The linked map's places, from the shared map cache (re-read whenever
    // it changes), loading the map the first time a link asks for it.
    const places = $derived.by<Suggestion[]>(() => {
        void $loadedMaps;
        const config = placeMapPath ? getMapConfig(placeMapPath) : null;
        return config ? placeLabels(config) : [];
    });
    $effect(() => {
        if (placeMapPath && !getMapConfig(placeMapPath)) {
            loadMapConfig(placeMapPath);
        }
    });

    /**
     * Up to 8 items whose label contains `typed`, ignoring case. Same-named
     * notes in different folders share a title, and links resolve
     * case-insensitively: each name is listed once (it also keys the #each
     * below, which throws on duplicate keys).
     */
    function matching<T>(
        pool: T[],
        typed: string,
        label: (item: T) => string,
    ): T[] {
        const q = typed.toLowerCase();
        const seen = new Set<string>();
        return pool
            .filter((item) => {
                const key = label(item).toLowerCase();
                if (!key.includes(q) || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 8);
    }

    const suggestions = $derived.by<Suggestion[]>(() => {
        if (!token) return [];
        switch (mapQuery?.kind) {
            case "map":
                return matching($allMaps, mapQuery.name, (m) => m.title).map(
                    (m) => ({ label: m.title }),
                );
            case "place":
                return matching(places, mapQuery.place, (p) => p.label);
            case "alias":
                // Typing a map link's alias: nothing to suggest.
                return [];
            default:
                return matching($allFileTitles, token.query, (t) => t).map(
                    (label) => ({ label }),
                );
        }
    });

    function refreshToken() {
        if (!textareaEl) return;
        token = wikilinkQueryAt(value, textareaEl.selectionStart);
        selectedIndex = 0;
    }

    function apply(title: string) {
        if (!textareaEl) return;
        // Recompute the token from live caret state: arrow keys move the
        // caret without refreshing the stored token, so a stored start
        // offset would be stale. token itself only carries the query for
        // display/filtering.
        const live = wikilinkQueryAt(value, textareaEl.selectionStart);
        if (!live) {
            token = null;
            return;
        }
        // A map name leaves the link open for a `#place`; a place or a page
        // name closes it.
        const q = mapLinkQuery(live.query);
        const caretNow = textareaEl.selectionStart;
        const r =
            q?.kind === "map"
                ? applyMapNameCompletion(
                      value,
                      caretNow,
                      live.start + q.nameStart,
                      title,
                  )
                : applyWikilinkCompletion(
                      value,
                      caretNow,
                      q?.kind === "place"
                          ? live.start + q.placeStart
                          : live.start,
                      title,
                  );
        value = r.text;
        token = null;
        const el = textareaEl;
        const caret = r.caret;
        // Restore the caret after Svelte flushes the new value.
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(caret, caret);
        });
    }

    function onKeyDown(e: KeyboardEvent) {
        if (!token || suggestions.length === 0) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % suggestions.length;
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedIndex =
                (selectedIndex - 1 + suggestions.length) % suggestions.length;
        } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            apply(suggestions[selectedIndex].label);
        } else if (e.key === "Escape") {
            // Close only the dropdown, not the surrounding modal.
            e.stopPropagation();
            token = null;
        }
    }
</script>

<div class="wrap">
    <textarea
        bind:this={textareaEl}
        bind:value
        {rows}
        {placeholder}
        oninput={refreshToken}
        onclick={refreshToken}
        onkeydown={onKeyDown}
        onblur={() => setTimeout(() => (token = null), 150)}
    ></textarea>
    {#if token && suggestions.length > 0}
        <ul class="suggestions" role="listbox">
            {#each suggestions as { label, kind }, i (label)}
                <li>
                    <button
                        type="button"
                        role="option"
                        aria-selected={i === selectedIndex}
                        class:selected={i === selectedIndex}
                        onpointerdown={(e) => {
                            e.preventDefault(); // keep textarea focus
                            apply(label);
                        }}
                    >
                        {label}
                        {#if kind}
                            <span class="kind">
                                {$t(placeKindKey(kind))}
                            </span>
                        {/if}
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .wrap {
        position: relative;
        display: flex;
        flex-direction: column;
    }
    textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 0.4rem 0.6rem;
        border-radius: 4px;
        border: 1px solid var(--color-border-primary);
        background: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 0.95rem;
        font-family: inherit;
        resize: vertical;
    }
    .suggestions {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        z-index: 20;
        margin: 2px 0 0;
        padding: 4px;
        list-style: none;
        max-height: 200px;
        overflow-y: auto;
        background: var(--color-background-tertiary);
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }
    .suggestions button {
        display: block;
        width: 100%;
        text-align: left;
        padding: 0.3rem 0.5rem;
        border: none;
        border-radius: 4px;
        background: none;
        color: var(--color-text-primary);
        font-size: 0.85rem;
        cursor: pointer;
    }
    .suggestions .kind {
        float: right;
        margin-left: 0.5rem;
        color: var(--color-text-secondary);
        font-size: 0.75rem;
    }
    .suggestions button:hover,
    .suggestions button.selected {
        background: var(--color-background-secondary);
    }
</style>
