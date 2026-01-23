<script lang="ts">
    import { autofocus } from "$lib/domActions";

    let {
        options,
        value = $bindable(),
        placeholder = "Search...",
        formatLabel = (s: string) => s,
        onSelect = undefined,
    } = $props<{
        options: string[];
        value: string;
        placeholder?: string;
        formatLabel?: (s: string) => string;
        onSelect?: (value: string) => void;
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
        if (onSelect) onSelect(option);
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
    }

    function handleKeydown(e: KeyboardEvent) {
        if (!isOpen) {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                e.preventDefault();
                openDropdown();
            }
            return;
        }

        if (e.key === "Escape") {
            closeDropdown();
            triggerElement?.focus();
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            highlightedIndex = (highlightedIndex + 1) % filteredOptions.length;
            scrollToHighlighted();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            highlightedIndex =
                (highlightedIndex - 1 + filteredOptions.length) %
                filteredOptions.length;
            scrollToHighlighted();
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filteredOptions[highlightedIndex]) {
                selectOption(filteredOptions[highlightedIndex]);
            }
        }
    }

    function scrollToHighlighted() {
        if (!listContainer) return;
        const item = listContainer.children[highlightedIndex] as HTMLElement;
        if (item) {
            item.scrollIntoView({ block: "nearest" });
        }
    }

    function handleWindowClick(e: MouseEvent) {
        if (
            isOpen &&
            triggerElement &&
            !triggerElement.contains(e.target as Node) &&
            // Check if click is inside the dropdown portal (we can't easily check ref since it's in a portal,
            // but we can check the class)
            !(e.target as HTMLElement).closest(".dropdown-menu")
        ) {
            closeDropdown();
        }
    }
</script>

<svelte:window onclick={handleWindowClick} onresize={closeDropdown} />

<div class="searchable-select-wrapper">
    <!-- Reusing .form-input styles for the visual look, adding specific layout -->
    <button
        bind:this={triggerElement}
        class="form-input trigger-btn"
        onclick={toggleOpen}
        onkeydown={handleKeydown}
        type="button"
    >
        <span class="label-text {value ? '' : 'placeholder'}">
            {value ? formatLabel(value) : placeholder}
        </span>
        <span class="arrow">▼</span>
    </button>

    {#if isOpen}
        <!-- Portal-like behavior: Fixed position to break out of overflow:hidden parents -->
        <div
            class="dropdown-menu"
            style="{dropdownStyle} position: fixed; max-height: 250px; display: flex; flex-direction: column; overflow: hidden;"
        >
            <input
                type="text"
                class="dropdown-search"
                bind:value={searchQuery}
                placeholder="Filter..."
                use:autofocus
                onclick={(e) => e.stopPropagation()}
                onkeydown={handleKeydown}
            />
            <ul class="options-list" bind:this={listContainer}>
                {#each filteredOptions as opt, i}
                    <li>
                        <button
                            class:highlighted={i === highlightedIndex}
                            class:selected={opt === value}
                            onclick={() => selectOption(opt)}
                            onmouseenter={() => (highlightedIndex = i)}
                        >
                            {formatLabel(opt)}
                        </button>
                    </li>
                {/each}
                {#if filteredOptions.length === 0}
                    <li class="no-results">No results found</li>
                {/if}
            </ul>
        </div>
    {/if}
</div>

<style>
    .searchable-select-wrapper {
        position: relative;
        width: 100%;
    }

    .trigger-btn {
        display: flex;
        justify-content: space-between;
        align-items: center;
        text-align: left;
        cursor: pointer;
    }

    .label-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-grow: 1;
    }
    .label-text.placeholder {
        color: var(--color-text-secondary);
        font-style: italic;
    }

    .arrow {
        font-size: 0.7rem;
        margin-left: 0.5rem;
        opacity: 0.7;
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
        /* List styles handled globally by .dropdown-menu ul in app.css */
        overflow-y: auto;
        flex-grow: 1;
    }

    .no-results {
        padding: 1rem;
        color: var(--color-text-secondary);
        text-align: center;
        font-size: 0.9rem;
    }
</style>
