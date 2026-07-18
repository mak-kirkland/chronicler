<script lang="ts">
    import {
        applyWikilinkCompletion,
        wikilinkQueryAt,
    } from "$lib/wikilinkAutocomplete";
    import { allFileTitles } from "$lib/worldStore";

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

    const suggestions = $derived.by<string[]>(() => {
        if (!token) return [];
        const q = token.query.toLowerCase();
        return $allFileTitles
            .filter((t: string) => t.toLowerCase().includes(q))
            .slice(0, 8);
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
        const r = applyWikilinkCompletion(
            value,
            textareaEl.selectionStart,
            live.start,
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
            apply(suggestions[selectedIndex]);
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
            {#each suggestions as title, i (title)}
                <li>
                    <button
                        type="button"
                        role="option"
                        aria-selected={i === selectedIndex}
                        class:selected={i === selectedIndex}
                        onpointerdown={(e) => {
                            e.preventDefault(); // keep textarea focus
                            apply(title);
                        }}
                    >
                        {title}
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
    .suggestions button:hover,
    .suggestions button.selected {
        background: var(--color-background-secondary);
    }
</style>
