<script lang="ts">
    import {
        tabs,
        tabStatus,
        activeTabId,
        displayedPanes,
        isViewSplit,
    } from "$lib/viewStores";
    import { isSidebarVisible } from "$lib/settingsStore";
    import TabItem from "$lib/components/views/TabItem.svelte";
    import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
    import Icon from "$lib/components/ui/Icon.svelte";
    import { t } from "$lib/i18n";

    let menu = $state<{ id: string; x: number; y: number } | null>(null);

    function openMenu(e: MouseEvent, id: string) {
        e.preventDefault();
        menu = { id, x: e.clientX, y: e.clientY };
    }
    function closeMenu() {
        menu = null;
    }
</script>

<div class="tab-bar" role="tablist">
    <button
        class="sidebar-toggle-btn"
        title={$isSidebarVisible
            ? $t("tabs.hideSidebar")
            : $t("tabs.showSidebar")}
        aria-label={$t("tabs.toggleSidebar")}
        aria-pressed={$isSidebarVisible}
        onclick={() => ($isSidebarVisible = !$isSidebarVisible)}
    >
        ☰
    </button>
    <div class="tabs-scroll">
        {#each $tabs.tabs as tab (tab.id)}
            <div class="tab-slot">
                <TabItem
                    {tab}
                    active={tab.id === $activeTabId}
                    displayed={$displayedPanes.includes(tab.id) &&
                        tab.id !== $activeTabId}
                    status={$tabStatus[tab.id]}
                    onActivate={() => tabs.activate(tab.id)}
                    onClose={() => tabs.close(tab.id)}
                    onContextMenu={(e) => openMenu(e, tab.id)}
                />
            </div>
        {/each}
    </div>
    <button
        class="icon-btn split-btn"
        title={$isViewSplit ? $t("tabs.alreadySplit") : $t("tabs.splitView")}
        aria-label={$t("tabs.splitView")}
        disabled={$isViewSplit}
        onclick={() => tabs.split()}
    >
        <Icon type="split" />
    </button>
    <button
        class="icon-btn new-tab-btn"
        title={$t("tabs.newTab")}
        onclick={() => tabs.newBlankTab()}
    >
        <Icon type="newFile" />
    </button>
</div>

{#if menu}
    <ContextMenu
        x={menu.x}
        y={menu.y}
        onClose={closeMenu}
        actions={[
            { label: $t("common.close"), handler: () => tabs.close(menu!.id) },
            {
                label: $t("tabs.closeOthers"),
                handler: () => tabs.closeOthers(menu!.id),
            },
            { label: $t("tabs.closeAll"), handler: () => tabs.closeAll() },
        ]}
    />
{/if}

<style>
    .tab-bar {
        display: flex;
        align-items: stretch;
        height: var(--chrome-tab-bar-height);
        box-sizing: border-box;
        flex-shrink: 0;
        border-bottom: 1px solid var(--color-border-primary);
        background: var(--color-background-secondary);
    }
    .tabs-scroll {
        display: flex;
        align-items: stretch;
        overflow-x: auto;
        overflow-y: hidden;
        flex-grow: 1;
        scrollbar-width: thin;
    }
    .tab-slot {
        display: flex;
        align-items: stretch;
    }
    /* The sidebar toggle isn't an .icon-btn: it keeps the full-height hit area
       and the rule that walls it off from the tab strip. */
    .sidebar-toggle-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        background: none;
        border: none;
        color: var(--color-text-secondary);
        cursor: pointer;
    }
    /* The sidebar toggle is chrome for the whole window, so it keeps its rule
       and full-height hit area. */
    .sidebar-toggle-btn {
        width: 38px;
        border-right: 1px solid var(--color-border-primary);
        font-size: 1.1rem;
        line-height: 1;
    }
    /* These two act on the tab strip, so they sit inside it as quiet ghost
       buttons rather than being walled off behind dividers. */
    .new-tab-btn,
    .split-btn {
        width: 30px;
        height: 30px;
        flex-shrink: 0;
        align-self: center;
        margin: 0 2px;
    }
    .new-tab-btn:hover,
    .split-btn:hover:not(:disabled),
    .sidebar-toggle-btn:hover {
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
        opacity: 1;
    }
    .split-btn:disabled {
        opacity: 0.3;
        cursor: default;
    }
</style>
