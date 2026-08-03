<script lang="ts">
    import { onDestroy } from "svelte";
    import { t } from "$lib/i18n";

    let { value = $bindable(), placeholder = undefined } = $props<{
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
        placeholder={placeholder ?? $t("common.searchPlaceholder")}
        class="search-input"
    />
</div>

<style>
    /* Deliberately the same inset, radius, height and type size as the vault
       chip above it in the sidebar: they're both single-line controls in the
       same stack, and they used to disagree on all four. The separator line
       is gone too — the tab rail below already draws one. */
    .search-container {
        padding: 10px 12px 0;
    }
    .search-input {
        width: 100%;
        box-sizing: border-box;
        padding: 6px 9px;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
        font-family: inherit;
        font-size: 0.86rem;
        transition: border-color 0.15s;
    }
    .search-input::placeholder {
        color: var(--color-text-secondary);
    }
    .search-input:focus {
        outline: none;
        border-color: var(--color-accent-primary);
        box-shadow: 0 0 0 1px var(--color-accent-primary);
    }
</style>
