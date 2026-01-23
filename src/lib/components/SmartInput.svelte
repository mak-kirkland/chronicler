<script lang="ts">
    /**
     * SmartInput
     * Dedicated component for prose editing with Wiki-Link support.
     * Automatically detects `[[` and `![[` triggers.
     */
    import { allFileTitles, allImageFiles } from "$lib/worldStore";

    let {
        value = $bindable(),
        placeholder = "",
        multiline = false,
        id = "",
        className = "",
    } = $props<{
        value: string;
        placeholder?: string;
        multiline?: boolean;
        id?: string;
        className?: string;
    }>();

    // --- State ---
    let inputEl = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
    let listContainer = $state<HTMLUListElement | null>(null);

    // Dropdown Logic
    let isOpen = $state(false);
    let dropdownPos = $state<{
        top: number;
        left: number;
        width: number;
    } | null>(null);
    let selectedIndex = $state(0);
    let suggestions = $state<string[]>([]);

    // Logic tracking
    let matchStart = $state(-1);
    let matchLength = $state(0);
    let isImageLink = $state(false); // [[ vs ![[

    function handleInput() {
        if (!inputEl) return;
        const val = inputEl.value;
        const cursor = inputEl.selectionStart || 0;
        const textBefore = val.slice(0, cursor);

        // Regex: Looks for [[ or ![[ at the end of the string
        // Captures: 1=trigger (![[ or [[), 2=query
        const match = /(?:^|[\s])(!?\[\[)([^\]\n]*)$/.exec(textBefore);

        if (match) {
            const trigger = match[1];
            const query = match[2];
            const fullMatchStr = match[0];

            // If match starts with space/newline, adjust start index for replacement
            const offset =
                fullMatchStr.startsWith(" ") || fullMatchStr.startsWith("\n")
                    ? 1
                    : 0;

            matchStart = match.index + offset;
            matchLength = trigger.length + query.length;
            isImageLink = trigger.includes("!");

            // Choose source based on trigger
            // Using $store syntax directly thanks to Svelte 5 auto-sub
            const source = isImageLink ? $allImageFiles : $allFileTitles;

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

    function scrollToHighlighted() {
        if (!listContainer) return;
        // In SmartInput, the container div scrolls, but the scrollIntoView on the item
        // works regardless of where the scrollbar is.
        const item = listContainer.children[selectedIndex] as HTMLElement;
        if (item) {
            item.scrollIntoView({ block: "nearest" });
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (isOpen && suggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % suggestions.length;
                scrollToHighlighted();
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                selectedIndex =
                    (selectedIndex - 1 + suggestions.length) %
                    suggestions.length;
                scrollToHighlighted();
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
    }

    function confirmSuggestion(item: string) {
        if (!inputEl) return;

        const before = value.slice(0, matchStart);
        const after = value.slice(matchStart + matchLength);

        const prefix = isImageLink ? "![[" : "[[";
        const insertion = `${prefix}${item}]]`;

        value = before + insertion + after;

        closeDropdown();

        // Restore focus and move cursor to end of inserted link
        setTimeout(() => {
            if (inputEl) {
                inputEl.focus();
                const newCursor = matchStart + insertion.length;
                inputEl.setSelectionRange(newCursor, newCursor);
            }
        }, 0);
    }
</script>

<svelte:window onresize={closeDropdown} onscroll={closeDropdown} />

<div class="smart-input-wrapper {className}">
    {#if multiline}
        <textarea
            bind:this={inputEl}
            bind:value
            {id}
            {placeholder}
            rows="2"
            class="form-input"
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
            class="form-input"
            oninput={handleInput}
            onkeydown={handleKeydown}
            onblur={() => setTimeout(closeDropdown, 200)}
        />
    {/if}

    {#if isOpen && dropdownPos}
        <div
            class="dropdown-menu"
            style="position: fixed; top: {dropdownPos.top}px; left: {dropdownPos.left}px; width: {dropdownPos.width}px; max-height: 250px;"
        >
            <ul bind:this={listContainer}>
                {#each suggestions as s, i}
                    <li>
                        <button
                            class:highlighted={i === selectedIndex}
                            onmousedown={() => confirmSuggestion(s)}
                        >
                            {s}
                        </button>
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

    /* Ensure resize property is set locally as generic form-input doesn't dictate it */
    textarea.form-input {
        resize: vertical;
    }
</style>
