<script lang="ts">
    let {
        children,
        variant = "primary",
        size = "normal",
        class: className = "",
        onclick = () => {},
        disabled = false,
        ...rest
    } = $props<{
        children: any;
        variant?: "primary" | "ghost";
        size?: "small" | "normal" | "large";
        class?: string;
        onclick?: (event: MouseEvent) => void;
        disabled?: boolean;
        [key: string]: any;
    }>();
</script>

<button class="btn {variant} {size} {className}" {disabled} {onclick} {...rest}>
    {@render children()}
</button>

<style>
    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        border-radius: 6px;
        cursor: pointer;
        font-family: inherit;
        transition:
            background-color 0.2s,
            opacity 0.2s;
    }
    .btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    /* --- Sizes --- */
    .small {
        padding: 0.4rem 0.8rem;
        font-size: 0.9rem;
    }
    .normal {
        padding: 0.5rem 1rem;
        font-size: 1rem;
    }
    .large {
        padding: 0.75rem 1.5rem;
        font-size: 1.1rem;
    }

    /* --- Variants --- */
    .primary {
        border: 1px solid var(--color-background-secondary);
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
    }
    .primary:hover:not(:disabled) {
        background-color: var(--color-background-tertiary);
    }

    .ghost {
        background: none;
        border: none;
        padding: 0.25rem;
        color: var(--color-text-secondary);
        opacity: 0.8;
        font-size: 1.5rem;
    }
    .ghost:hover:not(:disabled) {
        opacity: 1;
        background-color: transparent;
    }
</style>
