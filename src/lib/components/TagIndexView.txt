<script lang="ts">
    import { tags } from "$lib/worldStore";
    import { navigateToPage } from "$lib/actions";

    let { name } = $props<{ name: string }>();

    const pages = $derived.by(() => {
        const tagData = $tags.find(([tagName]) => tagName === name);
        return tagData ? tagData[1] : []; // Return the pages array or an empty array
    });
</script>

<div class="tag-index-wrapper">
    <h2>Index for <span class="tag-highlight">#{name}</span></h2>

    <ul class="page-link-list">
        {#each pages as page (page.path)}
            <li>
                <button
                    class="link-button"
                    onclick={() => navigateToPage(page)}
                >
                    {page.title}
                </button>
            </li>
        {/each}
    </ul>
</div>

<style>
    .tag-index-wrapper {
        padding: 2rem;
        height: 100%;
        overflow-y: auto;
        box-sizing: border-box;
    }
    h2 {
        font-family: "Uncial Antiqua", cursive;
        color: var(--ink-light);
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 0.5rem;
        margin-top: 0;
        margin-bottom: 1rem;
    }
    .tag-highlight {
        color: var(--ink);
        font-weight: bold;
    }
    .page-link-list {
        list-style: disc;
        padding-left: 2rem;
    }

    .page-link-list li {
        margin-bottom: 0.5rem;
    }

    /* Target the global helper class within this component */
    .page-link-list :global(.link-button) {
        font-size: 1.1rem;
    }
</style>
