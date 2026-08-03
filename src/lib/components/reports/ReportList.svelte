<script lang="ts">
    import { brokenLinks, parseErrors, brokenImages } from "$lib/worldStore";
    import { navigateToReport } from "$lib/actions";
    import Icon from "$lib/components/ui/Icon.svelte";
    import { t } from "$lib/i18n";
</script>

<div class="report-list">
    <!-- Broken Links Report Item -->
    {#if $brokenLinks.length > 0}
        <div
            class="sidebar-row"
            onclick={() => navigateToReport("broken-links")}
            onkeydown={(e) =>
                e.key === "Enter" && navigateToReport("broken-links")}
            role="button"
            tabindex="0"
        >
            <Icon type="reports" />
            <span class="report-name">{$t("reports.brokenLinks")}</span>
            <span class="row-count">{$brokenLinks.length}</span>
        </div>
    {/if}

    <!-- Broken Images Report Item -->
    {#if $brokenImages.length > 0}
        <div
            class="sidebar-row"
            onclick={() => navigateToReport("broken-images")}
            onkeydown={(e) =>
                e.key === "Enter" && navigateToReport("broken-images")}
            role="button"
            tabindex="0"
        >
            <Icon type="reports" />
            <span class="report-name">{$t("reports.brokenImages")}</span>
            <span class="row-count">{$brokenImages.length}</span>
        </div>
    {/if}

    <!-- Parse Errors Report Item -->
    {#if $parseErrors.length > 0}
        <div
            class="sidebar-row"
            onclick={() => navigateToReport("parse-errors")}
            onkeydown={(e) =>
                e.key === "Enter" && navigateToReport("parse-errors")}
            role="button"
            tabindex="0"
        >
            <Icon type="reports" />
            <span class="report-name">{$t("reports.parseErrors")}</span>
            <span class="row-count">{$parseErrors.length}</span>
        </div>
    {/if}

    {#if $brokenLinks.length === 0 && $parseErrors.length === 0 && $brokenImages.length === 0}
        <p class="text-muted text-center">{$t("reports.noIssues")}</p>
    {/if}
</div>

<style>
    .report-list {
        display: flex;
        flex-direction: column;
        font-size: 0.95rem;
    }
    .report-name {
        flex-grow: 1;
        min-width: 0;
        color: var(--color-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .text-muted.text-center {
        margin-top: 1rem;
    }
</style>
