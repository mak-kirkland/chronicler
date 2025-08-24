<script lang="ts">
    import { brokenLinks } from "$lib/worldStore";
    import { navigateToReport } from "$lib/actions";
</script>

<div class="report-list">
    <div
        class="report-item"
        onclick={() => navigateToReport("broken-links")}
        onkeydown={(e) => e.key === "Enter" && navigateToReport("broken-links")}
        role="button"
        tabindex="0"
    >
        <span class="report-name">Broken Links</span>
        <span class="report-count">({$brokenLinks.length})</span>
    </div>
    <!-- More reports can be added here in the future -->
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
</style>
