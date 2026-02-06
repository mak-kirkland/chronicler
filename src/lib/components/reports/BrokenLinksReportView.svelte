<script lang="ts">
    import { brokenLinks, vaultPath } from "$lib/worldStore";
    import { navigateToPage, promptAndCreateItem } from "$lib/actions";
    import ViewHeader from "$lib/components/views/ViewHeader.svelte";

    /**
     * Handles the click event on a broken link target.
     * It opens the "New Page" modal, pre-filling the name of the page to be created.
     * @param target The name of the non-existent page to create.
     */
    function handleFixLink(target: string) {
        if ($vaultPath) {
            promptAndCreateItem("file", $vaultPath, target);
        }
    }
</script>

<div class="report-view-wrapper">
    <ViewHeader>
        <div slot="left">
            <h2>Report: Broken Links</h2>
        </div>
    </ViewHeader>

    <div class="report-content">
        {#if $brokenLinks.length > 0}
            <ul class="broken-links-list">
                {#each $brokenLinks as link (link.target)}
                    <li class="broken-link-item">
                        <button
                            class="target-button"
                            onclick={() => handleFixLink(link.target)}
                            title="Create page '{link.target}'"
                        >
                            {link.target}
                        </button>
                        <ul class="source-list">
                            {#each link.sources as source (source.path)}
                                <li>
                                    <button
                                        class="source-button"
                                        onclick={() => navigateToPage(source)}
                                        title="Go to '{source.title}'"
                                    >
                                        {source.title}
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    </li>
                {/each}
            </ul>
        {:else}
            <p class="text-muted text-center">
                No broken links found. Good job!
            </p>
        {/if}
    </div>
</div>

<style>
    .report-view-wrapper {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
    }
    h2 {
        border-bottom: none;
        padding-bottom: 0;
        margin: 0;
        font-size: 1.5rem;
    }
    .report-content {
        flex-grow: 1;
        overflow-y: auto;
        padding: 2rem;
    }
    .broken-links-list,
    .source-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .broken-link-item {
        margin-bottom: 1.5rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .broken-link-item:last-child {
        border-bottom: none;
    }
    .target-button {
        font-weight: bold;
        font-size: 1.2rem;
        margin-bottom: 0.5rem;
        color: var(--color-text-link-broken);
    }
    .target-button:hover {
        text-decoration: underline;
    }
    .source-list {
        padding-left: 1.5rem;
    }
    .source-list li {
        margin-bottom: 0.25rem;
        list-style-type: "↳";
        padding-left: 0.5rem;
    }
    .source-button {
        font-size: 1rem;
        color: var(--color-text-secondary);
    }
    .source-button:hover {
        color: var(--color-text-primary);
    }
    /* Shared styles for the buttons */
    .target-button,
    .source-button {
        background: none;
        border: none;
        padding: 0.2rem;
        text-align: left;
        cursor: pointer;
        width: 100%;
    }
</style>
