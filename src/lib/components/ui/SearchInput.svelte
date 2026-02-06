<script lang="ts">
    import { onDestroy } from "svelte";

    let { value = $bindable(), placeholder = "Search..." } = $props<{
        value?: string;
        placeholder?: string;
    }>();

    // Internal state for the input field's display value
    let inputValue = $state(value || "");
    let timer: ReturnType<typeof setTimeout>;

    function handleInput(e: Event) {
        const target = e.target as HTMLInputElement;
        inputValue = target.value;

        // Clear the previous timer
        clearTimeout(timer);

        // Set a new timer to update the bound 'value' prop after 300ms
        timer = setTimeout(() => {
            value = inputValue;
        }, 300);
    }

    onDestroy(() => {
        clearTimeout(timer);
    });
</script>

<div class="search-container">
    <input
        type="search"
        value={inputValue}
        oninput={handleInput}
        {placeholder}
        class="search-input"
    />
</div>

<style>
    .search-container {
        padding: 0.75rem;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .search-input {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 0.95rem;
    }
    .search-input:focus {
        outline: 1px solid var(--color-accent-primary);
        border-color: var(--color-accent-primary);
    }
</style>
