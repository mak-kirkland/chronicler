<script lang="ts">
    import { autofocus } from "$lib/domActions";
    import FloatingMenu from "$lib/components/FloatingMenu.svelte";
    import {
        ListNavigator,
        handleListNavigation,
    } from "$lib/ListNavigator.svelte";

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

    let listContainer: HTMLUListElement | undefined = $state();
    let triggerElement: HTMLButtonElement | undefined = $state();

    const nav = new ListNavigator<string>();

    // Filter options based on the search query
    const filteredOptions = $derived(
        options.filter((opt: any) =>
            formatLabel(opt).toLowerCase().includes(searchQuery.toLowerCase()),
        ),
    );

    $effect(() => {
        nav.setOptions(filteredOptions);
    });

    function selectOption(option: string) {
        value = option;
        if (onSelect) onSelect(option);
        closeDropdown();
    }

    function closeDropdown() {
        isOpen = false;
        searchQuery = "";
        nav.index = 0;
    }

    function toggleOpen() {
        if (isOpen) {
            closeDropdown();
        } else {
            isOpen = true;
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        handleListNavigation(e, {
            isOpen,
            nav,
            listContainer,
            onSelect: selectOption,
            onClose: closeDropdown,
            onOpen: () => (isOpen = true),
            triggerElement,
        });
    }
</script>

<div class="searchable-select-wrapper">
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

    <FloatingMenu
        {isOpen}
        anchorEl={triggerElement}
        onClose={closeDropdown}
        style="max-height: 250px; display: flex; flex-direction: column; overflow: hidden;"
    >
        <input
            type="text"
            class="form-input dropdown-search"
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
                        class:highlighted={i === nav.index}
                        class:selected={opt === value}
                        onclick={() => selectOption(opt)}
                        onmouseenter={() => (nav.index = i)}
                    >
                        {formatLabel(opt)}
                    </button>
                </li>
            {/each}
            {#if filteredOptions.length === 0}
                <li class="no-results">No results found</li>
            {/if}
        </ul>
    </FloatingMenu>
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
        border-radius: 0;
        border: none;
        border-bottom: 1px solid var(--color-border-primary);
        width: 100%;
    }

    .dropdown-search:focus {
        outline: none;
        box-shadow: none;
        border-bottom-color: var(--color-accent-primary);
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
