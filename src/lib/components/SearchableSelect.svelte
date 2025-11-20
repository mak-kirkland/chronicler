<script lang="ts">
    import { autofocus } from "$lib/domActions";

    let {
        options,
        value = $bindable(),
        placeholder = "Search...",
        formatLabel = (s: string) => s,
    } = $props<{
        options: string[];
        value: string;
        placeholder?: string;
        formatLabel?: (s: string) => string;
    }>();

    let isOpen = $state(false);
    let searchQuery = $state("");
    let highlightedIndex = $state(0);
    let listContainer: HTMLUListElement | undefined = $state();
    let triggerElement: HTMLButtonElement | undefined = $state();

    // State for fixed positioning
    let dropdownStyle = $state("");

    // Filter options based on the search query
    const filteredOptions = $derived(
        options.filter((opt: any) =>
            formatLabel(opt).toLowerCase().includes(searchQuery.toLowerCase()),
        ),
    );

    function selectOption(option: string) {
        value = option;
        closeDropdown();
    }

    function closeDropdown() {
        isOpen = false;
        searchQuery = "";
        highlightedIndex = 0;
    }

    function toggleOpen() {
        if (isOpen) {
            closeDropdown();
        } else {
            openDropdown();
        }
    }

    function openDropdown() {
        if (!triggerElement) return;

        // Calculate position relative to the viewport to escape modal overflow
        const rect = triggerElement.getBoundingClientRect();
        const top = rect.bottom + 4; // 4px gap
        const left = rect.left;
        const width = rect.width;

        dropdownStyle = `top: ${top}px; left: ${left}px; width: ${width}px;`;

        isOpen = true;
        searchQuery = "";
        highlightedIndex = 0;
    }

    function scrollIntoView(index: number) {
        if (!listContainer) return;
        const item = listContainer.children[index] as HTMLElement;
        if (item) {
            item.scrollIntoView({ block: "nearest" });
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        // If closed, only listen for open triggers
        if (!isOpen) {
            if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
                e.preventDefault();
                openDropdown();
            }
            return;
        }

        // Navigation logic when open
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                if (filteredOptions.length > 0) {
                    highlightedIndex =
                        (highlightedIndex + 1) % filteredOptions.length;
                    scrollIntoView(highlightedIndex);
                }
                break;
            case "ArrowUp":
                e.preventDefault();
                if (filteredOptions.length > 0) {
                    highlightedIndex =
                        (highlightedIndex - 1 + filteredOptions.length) %
                        filteredOptions.length;
                    scrollIntoView(highlightedIndex);
                }
                break;
            case "Enter":
                e.preventDefault();
                if (filteredOptions.length > 0) {
                    selectOption(filteredOptions[highlightedIndex]);
                }
                break;
            case "Escape":
                e.preventDefault();
                closeDropdown();
                break;
        }
    }
</script>

<!-- Close on window resize/scroll to keep fixed position aligned -->
<svelte:window on:resize={closeDropdown} on:scroll={closeDropdown} />

<div class="custom-select">
    <!-- Trigger Button -->
    <button
        type="button"
        class="select-trigger"
        bind:this={triggerElement}
        onclick={toggleOpen}
        onkeydown={handleKeydown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
    >
        <span class="truncate">{formatLabel(value)}</span>
        <span class="arrow">▼</span>
    </button>

    {#if isOpen}
        <!--
            Use fixed positioning with calculated coordinates to render
            on top of everything, avoiding modal scrollbars.
        -->
        <div class="dropdown-menu" style={dropdownStyle}>
            <input
                type="text"
                class="dropdown-search"
                {placeholder}
                bind:value={searchQuery}
                use:autofocus
                onclick={(e) => e.stopPropagation()}
                onkeydown={handleKeydown}
            />

            <ul class="options-list" role="listbox" bind:this={listContainer}>
                {#each filteredOptions as option, i (option)}
                    <li role="option" aria-selected={i === highlightedIndex}>
                        <button
                            type="button"
                            class="option-btn"
                            class:highlighted={i === highlightedIndex}
                            class:selected={option === value}
                            onclick={() => selectOption(option)}
                            onmouseenter={() => (highlightedIndex = i)}
                        >
                            {formatLabel(option)}
                        </button>
                    </li>
                {/each}
                {#if filteredOptions.length === 0}
                    <li class="no-results">No matches found</li>
                {/if}
            </ul>
        </div>

        <!-- Backdrop to close when clicking outside -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
            class="backdrop"
            role="button"
            tabindex="-1"
            onclick={closeDropdown}
            onkeydown={closeDropdown}
        ></div>
    {/if}
</div>

<style>
    .custom-select {
        position: relative;
        width: 100%;
    }

    .select-trigger {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 1rem;
        text-align: left;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .select-trigger:focus {
        outline: 1px solid var(--color-accent-primary);
        border-color: var(--color-accent-primary);
    }

    .truncate {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .arrow {
        font-size: 0.8em;
        opacity: 0.7;
        margin-left: 0.5rem;
    }

    .dropdown-menu {
        position: fixed; /* Changed from absolute to fixed */
        /* top, left, and width are set via inline styles */
        background-color: var(--color-background-primary);
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        box-shadow: 0 4px 12px var(--color-overlay-subtle);
        z-index: 1000; /* Higher z-index to sit above modals */
        overflow: hidden;
        max-height: 250px;
        display: flex;
        flex-direction: column;
    }

    .dropdown-search {
        width: 100%;
        padding: 0.5rem;
        border: none;
        border-bottom: 1px solid var(--color-border-primary);
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
        font-family: inherit;
        font-size: 1rem; /* Explicitly set font size */
        box-sizing: border-box;
    }

    .dropdown-search:focus {
        outline: none;
    }

    .options-list {
        list-style: none;
        padding: 0;
        margin: 0;
        overflow-y: auto;
        flex-grow: 1;
    }

    .option-btn {
        width: 100%;
        text-align: left;
        padding: 0.5rem 0.75rem;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-text-primary);
        font-size: 0.95rem;
    }

    .option-btn.highlighted {
        background-color: var(--color-background-secondary);
    }

    .option-btn.selected {
        font-weight: bold;
        color: var(--color-accent-primary);
        background-color: var(--color-background-tertiary);
    }

    .no-results {
        padding: 0.75rem;
        color: var(--color-text-secondary);
        font-style: italic;
        text-align: center;
    }

    .backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 900;
        cursor: default;
    }
</style>
