<script lang="ts">
    import { brokenImages } from "$lib/worldStore";
    import { navigateToPage } from "$lib/actions";
    import ViewHeader from "./ViewHeader.svelte";
</script>

<div class="report-view-wrapper">
    <ViewHeader>
        <div slot="left">
            <h2>Report: Broken Images</h2>
        </div>
    </ViewHeader>

    <div class="report-content">
        {#if $brokenImages.length > 0}
            <ul class="broken-images-list">
                {#each $brokenImages as image (image.target)}
                    <li class="broken-image-item">
                        <div class="target-name" title="Missing image file">
                            {image.target}
                        </div>
                        <ul class="source-list">
                            {#each image.sources as source (source.path)}
                                <li>
                                    <button
                                        class="source-button"
                                        onclick={() => navigateToPage(source)}
                                        title="Go to '{source.title}' to fix this embed"
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
                No broken images found. Everything looks good!
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
    .broken-images-list,
    .source-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .broken-image-item {
        margin-bottom: 1.5rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .broken-image-item:last-child {
        border-bottom: none;
    }
    .target-name {
        font-weight: bold;
        font-size: 1.2rem;
        margin-bottom: 0.5rem;
        color: var(--color-text-error); /* Use error color for missing files */
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    /* Add a small icon or indicator if desired, using CSS pseudo-elements */
    .target-name::before {
        content: "🖼️";
        font-size: 1rem;
        opacity: 0.7;
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
        background: none;
        border: none;
        padding: 0.2rem;
        text-align: left;
        cursor: pointer;
        width: 100%;
        font-size: 1rem;
        color: var(--color-text-secondary);
    }
    .source-button:hover {
        color: var(--color-text-primary);
        text-decoration: underline;
    }
</style>
