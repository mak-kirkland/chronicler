<script lang="ts">
    /**
     * AutocompleteInput.svelte
     * A text input that offers suggestions from a list but allows free text.
     * Best for fields like "Location", "Author", "Type" where the value
     * is often an existing entity.
     */
    import FloatingMenu from "$lib/components/FloatingMenu.svelte";
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
        // 1. Shift+Enter: Force Submit/Create (Bypasses list)
        if (e.key === "Enter" && e.shiftKey) {
            if (onEnter && value.trim()) {
                e.preventDefault();
                onEnter(value);
                isOpen = false;
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

        // 3. Fallback Enter
        if (e.key === "Enter") {
            if (onEnter && value.trim()) {
                e.preventDefault();
                onEnter(value);
                isOpen = false;
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
        style="max-height: 200px;"
    >
        <ul
            bind:this={listContainer}
            class="suggestions-list"
            style="list-style: none; padding: 0; margin: 0;"
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
    </FloatingMenu>
</div>

<style>
    .autocomplete-wrapper {
        position: relative;
        width: 100%;
    }
</style>
