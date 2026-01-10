<script lang="ts">
    /**
     * SmartInput
     * A self-contained input component that handles either:
     * 1. 'autocomplete': A combobox that filters a list of options (e.g., Tags).
     * 2. 'wiki': A text input that detects '[[...]]' or '![[...]]' for wiki-links.
     */

    let {
        value = $bindable(),
        mode = "wiki", // 'wiki' | 'autocomplete'
        options = [], // For autocomplete mode
        files = [], // For wiki mode (links)
        images = [], // For wiki mode (embedded images)
        placeholder = "",
        onEnter = undefined, // Callback for Enter key (mostly for tags)
        multiline = false,
        id = "",
        className = "",
    } = $props<{
        value: string;
        mode?: "wiki" | "autocomplete";
        options?: string[];
        files?: string[];
        images?: string[];
        placeholder?: string;
        onEnter?: (val: string) => void;
        multiline?: boolean;
        id?: string;
        className?: string;
    }>();

    // --- State ---
    let inputEl = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);

    // Dropdown Logic
    let isOpen = $state(false);
    let dropdownPos = $state<{
        top: number;
        left: number;
        width: number;
    } | null>(null);
    let selectedIndex = $state(0);
    let suggestions = $state<string[]>([]);
    let matchStart = $state(-1);
    let matchLength = $state(0);
    let isImageLink = $state(false); // To distinguish [[ vs ![[

    // --- Logic ---

    function handleInput(e: Event) {
        // We bind 'value' automatically, but need to check triggers
        if (!inputEl) return;
        const val = inputEl.value;
        const cursor = inputEl.selectionStart || 0;

        if (mode === "autocomplete") {
            // Filter options based on full value
            suggestions = options
                .filter((opt) => opt.toLowerCase().includes(val.toLowerCase()))
                .slice(0, 10);

            if (suggestions.length > 0) {
                openDropdown();
            } else {
                closeDropdown();
            }
            return;
        }

        if (mode === "wiki") {
            const textBefore = val.slice(0, cursor);
            // Regex: Looks for [[ or ![[ at the end of the string
            // Captures: 1=trigger (![[ or [[), 2=query
            const match = /(?:^|[\s])(!?\[\[)([^\]\n]*)$/.exec(textBefore);

            if (match) {
                const trigger = match[1];
                const query = match[2];
                const fullMatchStr = match[0];

                // If it starts with space, adjust start index
                const offset =
                    fullMatchStr.startsWith(" ") ||
                    fullMatchStr.startsWith("\n")
                        ? 1
                        : 0;

                matchStart = match.index + offset;
                matchLength = trigger.length + query.length;
                isImageLink = trigger.includes("!");

                const source = isImageLink ? images : files;
                suggestions = source
                    .filter((item) =>
                        item.toLowerCase().includes(query.toLowerCase()),
                    )
                    .slice(0, 10);

                if (suggestions.length > 0) {
                    openDropdown();
                } else {
                    closeDropdown();
                }
            } else {
                closeDropdown();
            }
        }
    }

    function openDropdown() {
        if (!inputEl) return;
        const rect = inputEl.getBoundingClientRect();
        dropdownPos = {
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
        };
        isOpen = true;
        selectedIndex = 0;
    }

    function closeDropdown() {
        isOpen = false;
        selectedIndex = 0;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (isOpen && suggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % suggestions.length;
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                selectedIndex =
                    (selectedIndex - 1 + suggestions.length) %
                    suggestions.length;
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                confirmSuggestion(suggestions[selectedIndex]);
                return;
            }
            if (e.key === "Escape") {
                closeDropdown();
                return;
            }
        }

        // Handle Enter for simple inputs (like adding tags)
        if (e.key === "Enter" && !e.shiftKey && onEnter) {
            e.preventDefault();
            // If we are in autocomplete mode but the user typed something custom
            // or pressed enter without selecting, use the raw value.
            onEnter(value);
            // Typically clear input after "Enter" action for tags
            if (mode === "autocomplete") {
                value = "";
                closeDropdown();
            }
        }
    }

    function confirmSuggestion(item: string) {
        if (!inputEl) return;

        if (mode === "autocomplete") {
            // Replace full value
            if (onEnter) {
                onEnter(item);
                value = "";
            } else {
                value = item;
            }
        } else if (mode === "wiki") {
            // Replace the partial wiki link
            const before = value.slice(0, matchStart);
            const after = value.slice(matchStart + matchLength);

            const prefix = isImageLink ? "![[" : "[[";
            const insertion = `${prefix}${item}]]`;

            value = before + insertion + after;

            // Restore focus and move cursor
            setTimeout(() => {
                if (inputEl) {
                    inputEl.focus();
                    const newCursor = matchStart + insertion.length;
                    inputEl.setSelectionRange(newCursor, newCursor);
                }
            }, 0);
        }

        closeDropdown();
    }
</script>

<div class="smart-input-wrapper {className}">
    {#if multiline}
        <textarea
            bind:this={inputEl}
            bind:value
            {id}
            {placeholder}
            rows="2"
            class="input-element"
            oninput={handleInput}
            onkeydown={handleKeydown}
            onblur={() => setTimeout(closeDropdown, 200)}
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
            onkeydown={handleKeydown}
            onblur={() => setTimeout(closeDropdown, 200)}
        />
    {/if}

    {#if isOpen && dropdownPos}
        <div
            class="fixed-dropdown"
            style="top: {dropdownPos.top}px; left: {dropdownPos.left}px; width: {dropdownPos.width}px;"
        >
            <ul class="suggestions-list">
                {#each suggestions as s, i}
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
        resize: vertical;
    }
    .input-element:focus {
        outline: 2px solid var(--color-accent-primary);
        outline-offset: -1px;
    }

    /* Fixed Dropdown */
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
