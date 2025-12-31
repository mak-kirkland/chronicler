<script lang="ts">
    import { brokenLinks, parseErrors, brokenImages } from "$lib/worldStore";
    import { navigateToReport } from "$lib/actions";
</script>

<div class="report-list">
    <!-- Broken Links Report Item -->
    {#if $brokenLinks.length > 0}
        <div
            class="report-item"
            onclick={() => navigateToReport("broken-links")}
            onkeydown={(e) =>
                e.key === "Enter" && navigateToReport("broken-links")}
            role="button"
            tabindex="0"
        >
            <span class="report-name">Broken Links</span>
            <span class="report-count">({$brokenLinks.length})</span>
        </div>
    {/if}

    <!-- Broken Images Report Item -->
    {#if $brokenImages.length > 0}
        <div
            class="report-item"
            onclick={() => navigateToReport("broken-images")}
            onkeydown={(e) =>
                e.key === "Enter" && navigateToReport("broken-images")}
            role="button"
            tabindex="0"
        >
            <span class="report-name">Broken Images</span>
            <span class="report-count">({$brokenImages.length})</span>
        </div>
    {/if}

    <!-- Parse Errors Report Item -->
    {#if $parseErrors.length > 0}
        <div
            class="report-item"
            onclick={() => navigateToReport("parse-errors")}
            onkeydown={(e) =>
                e.key === "Enter" && navigateToReport("parse-errors")}
            role="button"
            tabindex="0"
        >
            <span class="report-name">Parse Errors</span>
            <span class="report-count">({$parseErrors.length})</span>
        </div>
    {/if}

    {#if $brokenLinks.length === 0 && $parseErrors.length === 0 && $brokenImages.length === 0}
        <p class="text-muted text-center">No issues found.</p>
    {/if}
</div>

<style>
    .report-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .report-item {
        padding: 0.3rem 0.6rem;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: baseline;
    }
    .report-item:hover,
    .report-item:focus {
        background-color: var(--color-background-secondary);
        outline: none;
    }
    .report-name {
        font-weight: bold;
        color: var(--color-text-primary);
    }
    .report-count {
        color: var(--color-text-secondary);
        font-size: 0.9em;
    }
    .text-muted.text-center {
        margin-top: 1rem;
    }
</style>
