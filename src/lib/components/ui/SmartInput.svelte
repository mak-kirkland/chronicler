<script lang="ts">
    /**
     * SmartInput
     * Dedicated component for prose editing with Wiki-Link support.
     * Automatically detects `[[` and `![[` triggers.
     */
    import { allFileTitles, allImageFiles } from "$lib/worldStore";
    import FloatingMenu from "$lib/components/ui/FloatingMenu.svelte";
    import {
        ListNavigator,
        handleListNavigation,
    } from "$lib/ListNavigator.svelte";

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
    const nav = new ListNavigator<string>();

    // We hold suggestions locally because they depend on the REGEX match, not just 'value'
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
            const source = isImageLink ? $allImageFiles : $allFileTitles;

            suggestions = source
                .filter((item) =>
                    item.toLowerCase().includes(query.toLowerCase()),
                )
                .slice(0, 10);

            nav.setOptions(suggestions);
            isOpen = suggestions.length > 0;
        } else {
            isOpen = false;
        }
    }

    function confirmSuggestion(item: string) {
        if (!inputEl) return;

        const before = value.slice(0, matchStart);
        const after = value.slice(matchStart + matchLength);

        const prefix = isImageLink ? "![[" : "[[";
        const insertion = `${prefix}${item}]]`;

        value = before + insertion + after;

        isOpen = false;

        // Restore focus and move cursor to end of inserted link
        setTimeout(() => {
            if (inputEl) {
                inputEl.focus();
                const newCursor = matchStart + insertion.length;
                inputEl.setSelectionRange(newCursor, newCursor);
            }
        }, 0);
    }

    function handleKeydown(e: KeyboardEvent) {
        handleListNavigation(e, {
            isOpen,
            nav,
            listContainer,
            onSelect: confirmSuggestion,
            onClose: () => (isOpen = false),
            triggerElement: inputEl,
        });
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
            class="form-input"
            oninput={handleInput}
            onkeydown={handleKeydown}
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
        />
    {/if}

    <FloatingMenu
        {isOpen}
        anchorEl={inputEl}
        onClose={() => (isOpen = false)}
        style="max-height: 250px;"
    >
        <ul bind:this={listContainer}>
            {#each suggestions as s, i}
                <li>
                    <button
                        class:highlighted={i === nav.index}
                        onmousedown={() => confirmSuggestion(s)}
                    >
                        {s}
                    </button>
                </li>
            {/each}
        </ul>
    </FloatingMenu>
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
