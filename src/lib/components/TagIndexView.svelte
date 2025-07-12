<script lang="ts">
    import { tags } from "$lib/worldStore";
    import { navigateToPage } from "$lib/actions";
    import { navigation } from "$lib/stores";
    import Button from "$lib/components/Button.svelte";

    let { name } = $props<{ name: string }>();

    const pages = $derived.by(() => {
        const tagData = $tags.find(([tagName]) => tagName === name);
        return tagData ? tagData[1] : []; // Return the pages array or an empty array
    });
</script>

<div class="tag-index-wrapper">
    <div class="view-header">
        <div class="header-left">
            <div class="navigation-arrows">
                <Button
                    variant="ghost"
                    size="small"
                    title="Back"
                    disabled={!$navigation.canGoBack}
                    onclick={navigation.back}
                >
                    &larr;
                </Button>
                <Button
                    variant="ghost"
                    size="small"
                    title="Forward"
                    disabled={!$navigation.canGoForward}
                    onclick={navigation.forward}
                >
                    &rarr;
                </Button>
            </div>
            <h2>Index for <span class="tag-highlight">#{name}</span></h2>
        </div>
    </div>

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
    .view-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 1rem;
        height: 60px;
        background-color: rgba(253, 246, 227, 0.85);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        border-bottom: 1px solid var(--border-color);
        flex-shrink: 0;
    }
    .header-left {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .navigation-arrows {
        display: flex;
    }
    h2 {
        font-family: "Uncial Antiqua", cursive;
        color: var(--ink-light);
        border-bottom: none;
        padding-bottom: 0;
        margin: 0;
        font-size: 1.5rem;
    }
    .tag-highlight {
        color: var(--ink);
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
