<script lang="ts">
    /**
     * AutocompleteInput.svelte
     * A text input that offers suggestions from a list but allows free text.
     * Best for fields like "Location", "Author", "Type" where the value
     * is often an existing entity.
     */

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
    let selectedIndex = $state(0);
    let inputEl = $state<HTMLInputElement | null>(null);
    let listContainer = $state<HTMLUListElement | null>(null);

    // State for fixed positioning to escape overflow containers
    let dropdownPos = $state<{
        top: number;
        left: number;
        width: number;
    } | null>(null);

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

    // Auto-close if suggestions disappear (e.g. user cleared input or specific match)
    $effect(() => {
        if (suggestions.length === 0) {
            isOpen = false;
        }
    });

    /**
     * Calculates the position of the input relative to the viewport
     * so we can fix-position the dropdown.
     */
    function updateDropdownPosition() {
        if (inputEl) {
            const rect = inputEl.getBoundingClientRect();
            dropdownPos = {
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
            };
        }
    }

    function handleInput() {
        isOpen = suggestions.length > 0;
        selectedIndex = 0;
        if (isOpen) {
            updateDropdownPosition();
        }
    }

    function handleClick() {
        // Recalculate position on click in case the modal moved/resized
        if (suggestions.length > 0) {
            isOpen = true;
            updateDropdownPosition();
        }
    }

    function selectSuggestion(suggestion: string) {
        value = suggestion;
        isOpen = false;
        // Refocus input to keep user flow
        inputEl?.focus();
    }

    function scrollToHighlighted() {
        if (!listContainer) return;
        // In AutocompleteInput, the UL is the scroll container
        // We target the LI at the selected index
        const item = listContainer.children[selectedIndex] as HTMLElement;
        if (item) {
            item.scrollIntoView({ block: "nearest" });
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        // 1. Shift+Enter: Force Submit/Create
        // This takes priority to allow creating a new tag even if it matches a suggestion,
        // or just to quickly submit without looking at the list.
        if (e.key === "Enter" && e.shiftKey) {
            if (onEnter && value.trim()) {
                e.preventDefault();
                onEnter(value);
                isOpen = false;
            }
            return;
        }

        // 2. Dropdown Navigation (Only if open and has suggestions)
        if (isOpen && suggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % suggestions.length;
                scrollToHighlighted();
                return;
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                selectedIndex =
                    (selectedIndex - 1 + suggestions.length) %
                    suggestions.length;
                scrollToHighlighted();
                return;
            } else if (e.key === "Escape") {
                isOpen = false;
                return;
            } else if (e.key === "Tab") {
                e.preventDefault();
                selectSuggestion(suggestions[selectedIndex]);
                return;
            } else if (e.key === "Enter") {
                e.preventDefault();
                const selected = suggestions[selectedIndex];
                selectSuggestion(selected);

                // If onEnter is provided (like in Tag inputs), submit immediately
                if (onEnter) {
                    onEnter(selected);
                }
                return;
            }
        }

        // 3. Enter (No Dropdown Interaction): Submit/Create
        // If the dropdown is closed, OR if the user just hits Enter while bypassing selection,
        // we treat it as submission.
        if (e.key === "Enter") {
            if (onEnter && value.trim()) {
                e.preventDefault();
                onEnter(value);
                isOpen = false;
            }
        }
    }

    function handleBlur() {
        // Small delay to allow click events on the dropdown to register
        setTimeout(() => {
            isOpen = false;
        }, 200);
    }
</script>

<!-- Close dropdown on scroll/resize since fixed position will drift otherwise -->
<svelte:window
    onresize={() => (isOpen = false)}
    onscroll={() => (isOpen = false)}
/>

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
        onblur={handleBlur}
    />

    {#if isOpen && suggestions.length > 0 && dropdownPos}
        <ul
            bind:this={listContainer}
            class="dropdown-menu"
            style="position: fixed; top: {dropdownPos.top}px; left: {dropdownPos.left}px; width: {dropdownPos.width}px; max-height: 200px;"
        >
            {#each suggestions as suggestion, i}
                <li>
                    <button
                        class:highlighted={i === selectedIndex}
                        onmousedown={() => selectSuggestion(suggestion)}
                    >
                        {suggestion}
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .autocomplete-wrapper {
        position: relative;
        width: 100%;
    }
</style>
