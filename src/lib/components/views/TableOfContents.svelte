<script lang="ts">
    import type { TocEntry } from "$lib/bindings";
    import { isTocVisible } from "$lib/settingsStore";

    let { toc } = $props<{ toc: TocEntry[] }>();
</script>

<div class="toc-container">
    <div class="toc-header">
        <h4 class="toc-title">Contents</h4>
        <button
            class="toc-toggle"
            onclick={() => ($isTocVisible = !$isTocVisible)}
        >
            [{$isTocVisible ? "hide" : "show"}]
        </button>
    </div>
    {#if $isTocVisible}
        <nav class="toc-nav">
            <ul>
                {#each toc as entry (entry.id)}
                    <li class="toc-item" style="--level: {entry.level - 1}">
                        <a href="#{entry.id}">
                            <span>{entry.number}</span>
                            <span class="toc-text">{entry.text}</span>
                        </a>
                    </li>
                {/each}
            </ul>
        </nav>
    {/if}
</div>

<style>
    .toc-container {
        background-color: var(--color-overlay-light);
        border: 1px solid var(--color-border-primary);
        border-radius: 8px;
        /* Provide vertical padding only */
        padding: 1rem 0;
        margin: 2rem 0;
    }
    .toc-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        /* This padding value controls the outer spacing. Match it with .toc-item's base padding. */
        padding: 0 1rem;
        margin-bottom: 0.5rem;
    }
    .toc-title {
        font-family: var(--font-family-heading);
        margin: 0;
        font-size: 1.2rem;
    }
    .toc-toggle {
        background: none;
        border: none;
        color: var(--color-text-link);
        cursor: pointer;
        font-size: 0.9rem;
        padding: 0;
    }
    .toc-nav ul {
        list-style: none;
        margin: 0;
        padding: 0;
    }
    .toc-item {
        /* The <li> controls the indentation from the left AND right edges */
        /* To adjust the main "gap", change the '1rem' value here and in .toc-header */
        padding-left: calc((var(--level, 0) * 1.8rem));
        padding-right: 1rem;
    }
    .toc-item a {
        /* 'display: grid' is a block-level element. */
        /* It fills the space provided by the parent <li> */
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.75rem;
        /* 'center' for consistent vertical alignment. */
        align-items: center;
        text-decoration: none;
        color: var(--color-text-secondary);
        padding: 0.3rem 0.6em;
        border-radius: 4px;
        border-bottom: none;
        transition:
            background-color 0.2s ease-in-out,
            color 0.2s ease-in-out;
    }
    .toc-item a:hover {
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
        text-decoration: underline;
    }
</style>
