<script lang="ts">
    import { navigation } from "$lib/viewStores";
    import Button from "$lib/components/Button.svelte";
    import ThemedIcon from "./ThemedIcon.svelte";
</script>

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
                <ThemedIcon type="back" />
            </Button>
            <Button
                variant="ghost"
                size="small"
                title="Forward"
                disabled={!$navigation.canGoForward}
                onclick={navigation.forward}
            >
                <ThemedIcon type="forward" />
            </Button>
        </div>

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
        padding: 0 2rem;
        border-bottom: 1px solid var(--color-border-primary);
        z-index: 20;
        height: 60px;
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
    .view-actions {
        display: flex;
        gap: 0.5rem;
        flex-shrink: 0;
    }
</style>
