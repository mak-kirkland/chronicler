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
        variant?: "primary" | "accent" | "ghost";
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
        line-height: 1.2;
        transition:
            background-color 0.15s,
            border-color 0.15s,
            box-shadow 0.15s,
            opacity 0.15s;
    }
    /* One focus ring for every variant, drawn outside the border so it reads
       the same on the accent fill as on the flat ones. */
    .btn:focus-visible {
        outline: none;
        box-shadow:
            0 0 0 2px var(--color-background-primary),
            0 0 0 4px var(--color-accent-primary);
    }
    /* A press should be felt. 1px is enough and costs no layout. */
    .btn:active:not(:disabled) {
        transform: translateY(1px);
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
    /* The border used to be the same colour as the fill, so the button had no
       edge — on a secondary-background panel it vanished into the surface. */
    .primary {
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
    }
    .primary:hover:not(:disabled) {
        background-color: var(--color-background-tertiary);
        border-color: var(--color-accent-primary);
    }

    /* The one call to action on a surface — at most one per screen region.
       Text uses the page background so it inverts correctly on every theme.

       The font-size here is deliberate and deliberately wins over `size`:
       this variant is a small-caps label treatment, not a scaled version of
       the others, so `size="large"` changes only its padding. If you need an
       accent button with larger text, add `.accent.large` rather than
       expecting the size classes above to apply. */
    .accent {
        border: 1px solid var(--color-accent-primary);
        background-color: var(--color-accent-primary);
        color: var(--color-background-primary);
        /* The default icon colour IS the accent, so a masked icon on an
           accent fill would be invisible. Flip it with the text. */
        --color-icons: var(--color-background-primary);
        font-family: var(--font-family-heading);
        font-size: 0.75rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
    }
    /* Mixing toward the heading colour instead of filter: brightness() — a
       brightness bump barely moves an already-pale accent and blows out a
       saturated one, and it dims the text along with the fill. */
    .accent:hover:not(:disabled) {
        background-color: color-mix(
            in srgb,
            var(--color-accent-primary) 88%,
            var(--color-text-heading)
        );
        border-color: color-mix(
            in srgb,
            var(--color-accent-primary) 88%,
            var(--color-text-heading)
        );
    }

    .ghost {
        background: none;
        border: 1px solid transparent;
        padding: 0.25rem;
        color: var(--color-text-secondary);
        opacity: 0.8;
        font-size: 1.5rem;
    }
    /* Ghost buttons are usually a bare glyph. Without a hover surface there's
       nothing to tell you how big the target actually is. */
    .ghost:hover:not(:disabled) {
        opacity: 1;
        color: var(--color-text-primary);
        background-color: var(--color-overlay-medium);
    }
</style>
