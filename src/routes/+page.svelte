<script lang="ts">
    import type { Component } from "svelte";
    import { tabs } from "$lib/viewStores";
    import { currentViewOf } from "$lib/tabs";
    import type { Tab } from "$lib/tabs";
    import TabBar from "$lib/components/views/TabBar.svelte";

    // Import all possible main view components
    import WelcomeView from "$lib/components/views/WelcomeView.svelte";
    import TagIndexView from "$lib/components/views/TagIndexView.svelte";
    import FileView from "$lib/components/views/FileView.svelte";
    import ImageView from "$lib/components/views/ImageView.svelte";
    import MapView from "$lib/components/map/MapView.svelte";
    import BrokenLinksReportView from "$lib/components/reports/BrokenLinksReportView.svelte";
    import ParseErrorsReportView from "$lib/components/reports/ParseErrorsReportView.svelte";
    import BrokenImagesReport from "$lib/components/reports/BrokenImagesReport.svelte";

    // This is the component map. It associates view types with components.
    // The key for reports is namespaced to avoid conflicts (e.g., 'report:broken-links').
    const componentMap: Record<string, Component<any>> = {
        welcome: WelcomeView,
        tag: TagIndexView,
        file: FileView,
        image: ImageView,
        map: MapView,
        "report:broken-links": BrokenLinksReportView,
        "report:parse-errors": ParseErrorsReportView,
        "report:broken-images": BrokenImagesReport,
    };

    // Resolve a tab to the component + props to render. View-specific extras
    // (tabId/isActive/initialMode) are injected here so the template stays a
    // single, branch-free spread. `isActive` lets FileView's editor and MapView's
    // Leaflet re-measure when a tab mounted hidden becomes visible; `initialMode`
    // is a one-shot seed FileView reads only at mount.
    function resolve(
        tab: Tab,
        activeId: string,
    ): { component: Component<any>; props: Record<string, any> } {
        const view = currentViewOf(tab);
        const isActive = tab.id === activeId;
        let key: string = view.type;
        let props: Record<string, any> = {};
        switch (view.type) {
            case "file":
                props = {
                    file: view.data,
                    sectionId: view.sectionId,
                    tabId: tab.id,
                    isActive,
                    initialMode: tab.initialFileMode,
                };
                break;
            case "map":
                props = { data: view.data, isActive };
                break;
            case "image":
                props = { data: view.data };
                break;
            case "tag":
                props = { name: view.tagName };
                break;
            case "report":
                // For reports, we create a namespaced key to look up in the map.
                key = `report:${view.name}`;
                break;
        }
        return { component: componentMap[key], props };
    }
</script>

<div class="tabbed-layout">
    <TabBar />
    <div class="tab-panes">
        {#each $tabs.tabs as tab (tab.id)}
            {@const resolved = resolve(tab, $tabs.activeId)}
            {@const Active = resolved.component}
            <div class="tab-pane" class:active={tab.id === $tabs.activeId}>
                {#if Active}
                    <!-- Key on the component so the pane re-mounts when a tab's
                         view type changes in place (e.g. welcome → file via
                         openInCurrent). A bare dynamic <Active> in a reused
                         keyed-each block does not swap on its own. -->
                    {#key Active}
                        <Active {...resolved.props} />
                    {/key}
                {/if}
            </div>
        {/each}
    </div>
</div>

<style>
    .tabbed-layout {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-width: 0;
    }
    .tab-panes {
        position: relative;
        flex: 1;
        min-height: 0;
    }
    /* Inactive panes stay mounted (state preserved) but hidden. */
    .tab-pane {
        position: absolute;
        inset: 0;
        display: none;
    }
    .tab-pane.active {
        display: flex;
        flex-direction: column;
    }
</style>
