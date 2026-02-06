<script lang="ts">
    import { tags } from "$lib/worldStore";
    import { navigateToPage } from "$lib/actions";
    import ViewHeader from "$lib/components/views/ViewHeader.svelte";

    let { name } = $props<{ name: string }>();

    const pages = $derived.by(() => {
        const tagData = $tags.find(([tagName]) => tagName === name);
        return tagData ? tagData[1] : []; // Return the pages array or an empty array
    });
</script>

<div class="tag-index-wrapper">
    <ViewHeader>
        <div slot="left">
            <h2>Index for <span class="tag-highlight">#{name}</span></h2>
        </div>
    </ViewHeader>

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
        padding: 0;
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
    }
    h2 {
        border-bottom: none;
        padding-bottom: 0;
        margin: 0;
        font-size: 1.5rem;
    }
    .tag-highlight {
        color: var(--color-text-primary);
        font-weight: bold;
    }
    .page-link-list {
        list-style: disc;
        padding: 2rem;
        padding-left: 4rem;
        overflow-y: auto;
        flex-grow: 1;
    }

    .page-link-list li {
        margin-bottom: 0.5rem;
    }

    /* Target the global helper class within this component */
    .page-link-list :global(.link-button) {
        font-size: 1.1rem;
    }
</style>
