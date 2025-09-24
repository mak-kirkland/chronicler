<script lang="ts">
    import { parseErrors } from "$lib/worldStore";
    import { navigateToPage } from "$lib/actions";
    import ViewHeader from "./ViewHeader.svelte";
</script>

<div class="report-view-wrapper">
    <ViewHeader>
        <div slot="left">
            <h2>Report: Parse Errors</h2>
        </div>
    </ViewHeader>

    <div class="report-content">
        {#if $parseErrors.length > 0}
            <ul class="error-list">
                {#each $parseErrors as item (item.page.path)}
                    <li class="error-item">
                        <button
                            class="page-button"
                            onclick={() => navigateToPage(item.page)}
                            title="Go to '{item.page.title}' to fix"
                        >
                            {item.page.title}
                        </button>
                        <pre class="error-message">{item.error}</pre>
                    </li>
                {/each}
            </ul>
        {:else}
            <p class="text-muted text-center">
                No pages with parsing errors found. Well done!
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
    .error-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .error-item {
        margin-bottom: 1.5rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .error-item:last-child {
        border-bottom: none;
    }
    .page-button {
        font-weight: bold;
        font-size: 1.2rem;
        margin-bottom: 0.5rem;
        color: var(--color-text-link);
        background: none;
        border: none;
        padding: 0.2rem;
        text-align: left;
        cursor: pointer;
        width: 100%;
    }
    .page-button:hover {
        text-decoration: underline;
    }
    .error-message {
        background-color: var(--color-background-error);
        color: var(--color-text-error);
        padding: 0.75rem;
        border-radius: 4px;
        font-size: 0.85rem;
        white-space: pre-wrap;
        word-break: break-all;
        border: 1px solid var(--color-border-error);
    }
</style>
