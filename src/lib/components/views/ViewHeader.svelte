<script lang="ts">
    import { navigation } from "$lib/viewStores";
    import Button from "$lib/components/ui/Button.svelte";
    import Icon from "$lib/components/ui/Icon.svelte";
    import { t } from "$lib/i18n";
</script>

<div class="view-header">
    <div class="header-left">
        <div class="navigation-arrows">
            <Button
                variant="ghost"
                size="small"
                title={$t("nav.back")}
                disabled={!$navigation.canGoBack}
                onclick={navigation.back}
            >
                <Icon type="back" />
            </Button>
            <Button
                variant="ghost"
                size="small"
                title={$t("nav.forward")}
                disabled={!$navigation.canGoForward}
                onclick={navigation.forward}
            >
                <Icon type="forward" />
            </Button>
        </div>

        <!-- Separates navigation from identity: the arrows act on history,
             everything right of the rule describes the current page. -->
        <span class="header-divider" aria-hidden="true"></span>

        <!-- Slot for title and other left-aligned items -->
        <slot name="left" />
    </div>

    <!-- Slot for right-aligned action buttons -->
    <div class="view-actions">
        <slot name="right" />
    </div>
</div>

<style>
    .view-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        /* The right gutter widens in a split view, where +page.svelte floats a
           pane-close button over this corner and needs the actions out of its
           way. Everywhere else it stays symmetric with the left. */
        padding: 0 var(--view-header-gutter-right, 22px) 0 22px;
        /* Softer than the full border token: this rule runs the width of the
           window directly above the article, and at full strength it read as
           the first of the page's own horizontal rules. */
        border-bottom: 1px solid var(--hairline-soft);
        z-index: 20;
        height: var(--chrome-page-bar-height);
        box-sizing: border-box;
        flex-shrink: 0;
    }
    .header-left {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 1;
        min-width: 0; /* Prevents the container from overflowing */
    }
    .navigation-arrows {
        display: flex;
        flex-shrink: 0; /* Prevents arrows from being squished */
    }
    /* The arrows are the only oversized ghost buttons left in the chrome;
       size them for a 50px bar rather than the old 60px one. */
    .navigation-arrows :global(.btn.ghost) {
        padding: 6px;
        font-size: 1.2rem;
    }
    .header-divider {
        width: 1px;
        height: 20px;
        flex-shrink: 0;
        background: var(--color-border-primary);
        margin: 0 0.25rem;
    }
    .view-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
    }

    /* Every view puts its title in the left slot as an <h2>. The bar is now
       50px, so normalise them here instead of leaving each view to discover
       that browser default margins no longer fit. FileView opts out by
       supplying a breadcrumb instead of a heading. */
    .header-left :global(h2) {
        margin: 0;
        font-family: var(--font-family-heading);
        font-size: 1.05rem;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
</style>
