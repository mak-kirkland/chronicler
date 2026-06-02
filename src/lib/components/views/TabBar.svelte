<script lang="ts">
    import { tabs, tabStatus, activeTabId } from "$lib/viewStores";
    import TabItem from "$lib/components/views/TabItem.svelte";
    import ContextMenu from "$lib/components/ui/ContextMenu.svelte";
    import Icon from "$lib/components/ui/Icon.svelte";

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
    <div class="tabs-scroll">
        {#each $tabs.tabs as tab (tab.id)}
            <div class="tab-slot">
                <TabItem
                    {tab}
                    active={tab.id === $activeTabId}
                    status={$tabStatus[tab.id]}
                    onActivate={() => tabs.activate(tab.id)}
                    onClose={() => tabs.close(tab.id)}
                    onContextMenu={(e) => openMenu(e, tab.id)}
                />
            </div>
        {/each}
    </div>
    <button
        class="new-tab-btn"
        title="New tab"
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
            { label: "Close", handler: () => tabs.close(menu!.id) },
            {
                label: "Close Others",
                handler: () => tabs.closeOthers(menu!.id),
            },
            { label: "Close All", handler: () => tabs.closeAll() },
        ]}
    />
{/if}

<style>
    .tab-bar {
        display: flex;
        align-items: stretch;
        height: 38px;
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
    .new-tab-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        flex-shrink: 0;
        background: none;
        border: none;
        border-left: 1px solid var(--color-border-primary);
        color: var(--color-text-secondary);
        cursor: pointer;
    }
    .new-tab-btn:hover {
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
    }
</style>
