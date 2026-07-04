<script lang="ts">
    import type { InfoboxFrontmatter } from "$lib/infobox";
    import Infobox from "$lib/components/infobox/Infobox.svelte";

    let { infobox = null, fallbackHtml = "", fallbackTitle = "" } = $props<{
        infobox?: InfoboxFrontmatter | null;
        /** Backend-sanitized HTML shown when the page has no infobox. */
        fallbackHtml?: string;
        fallbackTitle?: string;
    }>();
</script>

{#if infobox}
    <div class="infobox-container">
        <Infobox data={infobox} onEdit={undefined} {fallbackTitle} />
    </div>
{:else if fallbackHtml}
    <div class="fallback">
        {@html fallbackHtml}
    </div>
{/if}

<style>
    /* Infobox styling overrides for compact preview contexts (hover popups,
       canvas cards): strip the page-context chrome. */
    .infobox-container :global(.infobox) {
        border: none;
        background: var(--color-background-primary);
        padding: var(--space-sm);
        margin: 0;
        position: relative;
        z-index: 1;
        border-radius: var(--radius-base);

        /* Consume height without forcing scroll. */
        max-height: 100%;
    }
    .fallback {
        padding: var(--space-sm);
        font-size: 0.9rem;
        line-height: 1.5;
        color: var(--color-text-primary);
        overflow: hidden;
    }
    .fallback :global(p:first-child) {
        margin-top: 0;
    }
    .fallback :global(p:last-child) {
        margin-bottom: 0;
    }
</style>
