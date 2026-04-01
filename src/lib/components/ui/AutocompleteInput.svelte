<script lang="ts">
    /**
     * AutocompleteInput.svelte
     * A text input that offers suggestions from a list but allows free text.
     * Best for fields like "Location", "Author", "Type" where the value
     * is often an existing entity.
     */
    import FloatingMenu from "$lib/components/ui/FloatingMenu.svelte";
    import {
        ListNavigator,
        handleListNavigation,
    } from "$lib/ListNavigator.svelte";

    let {
        value = $bindable(),
        options = [],
        placeholder = "",
        id = "",
        className = "",
        onEnter = undefined, // Optional callback when Enter/Shift+Enter is pressed
    } = $props<{
        value: string;
        options: string[];
        placeholder?: string;
        id?: string;
        className?: string;
        onEnter?: (val: string) => void;
    }>();

    let isOpen = $state(false);
    let inputEl = $state<HTMLInputElement | null>(null);
    let listContainer = $state<HTMLUListElement | null>(null);

    // --- Logic Extraction ---
    const nav = new ListNavigator<string>();

    // Filter options based on current input
    // We limit to 10 to keep the UI snappy
    const suggestions = $derived(
        value
            ? options
                  .filter((opt: string) =>
                      opt.toLowerCase().includes(value.toLowerCase()),
                  )
                  .slice(0, 10)
            : [],
    );

    // Sync navigator with suggestions
    $effect(() => {
        nav.setOptions(suggestions);
        if (suggestions.length === 0) {
            isOpen = false;
        }
    });

    function handleInput() {
        isOpen = suggestions.length > 0;
    }

    function handleClick() {
        // Recalculate position on click in case the modal moved/resized
        if (suggestions.length > 0) {
            isOpen = true;
        }
    }

    function selectSuggestion(suggestion: string) {
        value = suggestion;
        isOpen = false;
        // Refocus input to keep user flow
        inputEl?.focus();
        if (onEnter) onEnter(suggestion);
    }

    function handleKeydown(e: KeyboardEvent) {
        // 1. Shift+Enter: Force-accept typed text (bypasses suggestion list).
        //    Always closes the dropdown and keeps the raw value, even if
        //    a suggestion is highlighted. Calls onEnter if provided.
        if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            isOpen = false;
            if (onEnter && value.trim()) {
                onEnter(value);
            }
            return;
        }

        // 2. Delegate Navigation to Shared Logic
        const handled = handleListNavigation(e, {
            isOpen: isOpen && suggestions.length > 0,
            nav,
            listContainer,
            onSelect: selectSuggestion,
            onClose: () => (isOpen = false),
            triggerElement: inputEl,
        });

        if (handled) return;

        // 3. Fallback Enter (no suggestion highlighted, or dropdown closed)
        if (e.key === "Enter") {
            isOpen = false;
            if (onEnter && value.trim()) {
                e.preventDefault();
                onEnter(value);
            }
        }
    }
</script>

<div class="autocomplete-wrapper {className}">
    <input
        bind:this={inputEl}
        type="text"
        bind:value
        {id}
        {placeholder}
        class="form-input"
        autocomplete="off"
        oninput={handleInput}
        onclick={handleClick}
        onkeydown={handleKeydown}
    />

    <FloatingMenu
        isOpen={isOpen && suggestions.length > 0}
        anchorEl={inputEl}
        onClose={() => (isOpen = false)}
        style="max-height: 200px; display: flex; flex-direction: column; overflow: hidden;"
    >
        <ul
            bind:this={listContainer}
            class="suggestions-list"
            style="list-style: none; padding: 0; margin: 0; overflow-y: auto; flex: 1;"
        >
            {#each suggestions as suggestion, i}
                <li>
                    <button
                        class:highlighted={i === nav.index}
                        onmousedown={() => selectSuggestion(suggestion)}
                    >
                        {suggestion}
                    </button>
                </li>
            {/each}
        </ul>
        <div class="autocomplete-hint">
            Enter to select · Shift+Enter to use typed text
        </div>
    </FloatingMenu>
</div>

<style>
    .autocomplete-wrapper {
        position: relative;
        width: 100%;
    }

    .autocomplete-hint {
        flex-shrink: 0;
        padding: 0.3rem 0.6rem;
        font-size: 0.75rem;
        color: var(--color-text-tertiary);
        border-top: 1px solid var(--color-border-subtle);
        text-align: center;
        user-select: none;
    }
</style>
