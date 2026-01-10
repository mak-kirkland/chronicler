<script lang="ts">
    // Defined locally to decouple from specific business logic types
    export interface SmartInputContext {
        type: "link" | "image" | "tag" | string;
        query: string;
        triggerLength: number;
        triggerIndex: number;
    }

    let {
        value = $bindable(),
        type = "text",
        placeholder = "",
        onEnter = undefined, // Callback for Enter key (e.g., adding a tag)
        multiline = false,
        id = "",
        className = "",
        // Props for Logic Injection
        onSearch,
        getContext,
    } = $props<{
        value: string;
        type?: "text" | "link" | "image" | "tag" | "multiline";
        placeholder?: string;
        onEnter?: (val: string) => void;
        multiline?: boolean;
        id?: string;
        className?: string;
        // Function to fetch suggestions based on query + type
        onSearch: (
            query: string,
            type: "tag" | "link" | "image" | any,
        ) => string[];
        // Function to check if we are in a trigger state (e.g. "[[")
        getContext?: (text: string) => SmartInputContext | null;
    }>();

    // --- State ---
    let inputEl = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

    let dropdownPos = $state<{
        top: number;
        left: number;
        width: number;
    } | null>(null);
    let selectedIndex = $state(0);
    let activeAutocompleteType = $state<
        "tag" | "link" | "image" | string | null
    >(null);
    let searchQuery = $state("");

    // For inline autocomplete (text/multiline)
    let triggerIndex = $state(-1);
    let triggerLength = $state(0);

    // --- Derived Suggestions ---
    const currentSuggestions = $derived(
        activeAutocompleteType
            ? onSearch(searchQuery, activeAutocompleteType)
            : [],
    );

    // Reset selection when list changes
    $effect(() => {
        if (
            currentSuggestions.length > 0 &&
            selectedIndex >= currentSuggestions.length
        ) {
            selectedIndex = 0;
        }
    });

    // --- Logic ---

    function handleInput(e: Event) {
        const target = e.target as HTMLInputElement | HTMLTextAreaElement;
        const val = target.value;
        value = val; // Bind value manually

        // 1. Explicit Mode (Tag, Link, Image types)
        // These inputs ALWAYS trigger autocomplete for their specific type
        if (type === "tag" || type === "link" || type === "image") {
            activeAutocompleteType = type;
            searchQuery = val;
            updateDropdownPosition();
            return;
        }

        // 2. Inline Mode (Text, Multiline)
        // These trigger autocomplete only if the parent provided a context detector
        if ((type === "text" || type === "multiline") && getContext) {
            const cursor = target.selectionStart || 0;
            const textBefore = val.slice(0, cursor);
            const context = getContext(textBefore);

            if (context) {
                activeAutocompleteType = context.type;
                searchQuery = context.query;
                triggerIndex = context.triggerIndex;
                triggerLength = context.triggerLength;
                updateDropdownPosition();
                selectedIndex = 0;
            } else {
                closeSuggestions();
            }
        }
    }

    function handleFocus(e: FocusEvent) {
        // For explicit types, show suggestions immediately on focus
        if (type === "tag" || type === "link" || type === "image") {
            handleInput(e);
        }
    }

    function updateDropdownPosition() {
        if (!inputEl) return;
        const rect = inputEl.getBoundingClientRect();
        dropdownPos = {
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
        };
    }

    function handleKeydown(e: KeyboardEvent) {
        // Navigation
        if (activeAutocompleteType && currentSuggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % currentSuggestions.length;
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                selectedIndex =
                    (selectedIndex - 1 + currentSuggestions.length) %
                    currentSuggestions.length;
                return;
            }
            if (e.key === "Tab") {
                e.preventDefault();
                confirmSuggestion(currentSuggestions[selectedIndex]);
                return;
            }
        }

        // Selection / Enter
        if (e.key === "Enter") {
            // If autocomplete is active
            if (activeAutocompleteType) {
                e.preventDefault();
                // If suggestions exist, pick one
                if (currentSuggestions.length > 0) {
                    confirmSuggestion(currentSuggestions[selectedIndex]);
                } else if (type === "tag" || type === "link") {
                    // If no suggestion, but we are in explicit mode, allow confirming raw value
                    // This handles creating new tags or links
                    confirmSuggestion(searchQuery);
                }
                return;
            }

            // If no autocomplete, but specific callback (e.g. Add Tag)
            if (onEnter && !e.shiftKey) {
                e.preventDefault();
                onEnter(value);
            }
        }

        if (e.key === "Escape") {
            closeSuggestions();
        }
    }

    function confirmSuggestion(suggestion: string) {
        if (!suggestion) return;

        // 1. Explicit Mode Replacement
        if (type === "tag" || type === "link" || type === "image") {
            if (onEnter) {
                // If there's a callback (e.g. for tags), verify and call it
                onEnter(suggestion);
                // Usually we clear the input for tags
                if (type === "tag") value = "";
            } else {
                value = suggestion;
            }
            closeSuggestions();
            return;
        }

        // 2. Inline Mode Replacement
        if (type === "text" || type === "multiline") {
            const tag =
                (activeAutocompleteType === "image" ? "![[" : "[[") +
                suggestion +
                "]]";

            const prefix = value.slice(0, triggerIndex);
            // Calculate where the current query ends
            // query length is separate from trigger length
            const queryEnd = triggerIndex + triggerLength + searchQuery.length;
            const suffix = value.slice(queryEnd);

            value = prefix + tag + suffix;

            // Restore focus and move cursor (optional, but good UX)
            setTimeout(() => {
                if (inputEl) {
                    inputEl.focus();
                    // Set cursor after the inserted tag
                    const newCursorPos = prefix.length + tag.length;
                    inputEl.setSelectionRange(newCursorPos, newCursorPos);
                }
            }, 0);

            closeSuggestions();
        }
    }

    function closeSuggestions() {
        activeAutocompleteType = null;
        dropdownPos = null;
        selectedIndex = 0;
        triggerIndex = -1;
    }
</script>

<div class="smart-input-wrapper {className}">
    {#if multiline || type === "multiline"}
        <textarea
            bind:this={inputEl}
            bind:value
            {id}
            {placeholder}
            rows="2"
            class="input-element"
            oninput={handleInput}
            onfocus={handleFocus}
            onkeydown={handleKeydown}
            onblur={() => setTimeout(closeSuggestions, 200)}
        ></textarea>
    {:else}
        <input
            bind:this={inputEl}
            bind:value
            {id}
            type="text"
            {placeholder}
            class="input-element"
            oninput={handleInput}
            onfocus={handleFocus}
            onkeydown={handleKeydown}
            onblur={() => setTimeout(closeSuggestions, 200)}
        />
    {/if}

    {#if activeAutocompleteType && currentSuggestions.length > 0 && dropdownPos}
        <div
            class="fixed-dropdown"
            style="top: {dropdownPos.top}px; left: {dropdownPos.left}px; width: {dropdownPos.width}px;"
        >
            <ul class="suggestions-list">
                {#each currentSuggestions as s, i}
                    <li class:selected={i === selectedIndex}>
                        <button onmousedown={() => confirmSuggestion(s)}
                            >{s}</button
                        >
                    </li>
                {/each}
            </ul>
        </div>
    {/if}
</div>

<style>
    .smart-input-wrapper {
        position: relative;
        width: 100%;
        display: flex;
    }

    .input-element {
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-primary);
        color: var(--color-text-primary);
        padding: 0.6rem;
        border-radius: 6px;
        font-size: 0.95rem;
        width: 100%;
        box-sizing: border-box;
        font-family: inherit;
    }
    .input-element:focus {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: -1px;
    }

    /* Fixed Dropdown (Ported from Modal) */
    .fixed-dropdown {
        position: fixed;
        background: var(--color-background-secondary);
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        max-height: 250px;
        overflow-y: auto;
        z-index: 9999;
    }

    .suggestions-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .suggestions-list li button {
        width: 100%;
        text-align: left;
        background: none;
        border: none;
        padding: 0.6rem 1rem;
        color: var(--color-text-primary);
        cursor: pointer;
        font-size: 0.9rem;
    }
    .suggestions-list li.selected button,
    .suggestions-list li button:hover {
        background: var(--color-accent-primary);
        color: white;
    }
</style>
