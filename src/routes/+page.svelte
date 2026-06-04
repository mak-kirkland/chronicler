<script lang="ts">
    import type { Component } from "svelte";
    import { tabs } from "$lib/viewStores";
    import { currentViewOf, isSplit } from "$lib/tabs";
    import type { Tab, TabsState } from "$lib/tabs";
    import Icon from "$lib/components/ui/Icon.svelte";
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

    // Where a tab sits in the layout: "full" (single view), one side of a
    // split, or null when it's a background tab that stays mounted but hidden.
    type PaneSide = "full" | "left" | "right" | null;
    function paneSideOf(tab: Tab, state: TabsState): PaneSide {
        const pi = state.panes.indexOf(tab.id);
        if (pi === -1) return null;
        if (state.panes.length === 1) return "full";
        return pi === 0 ? "left" : "right";
    }

    // Resolve a tab to the component + props to render. View-specific extras
    // (tabId/isActive/initialMode) are injected here so the template stays a
    // single, branch-free spread. `isActive` (visible in a pane) lets FileView's
    // editor and MapView's Leaflet re-measure when a tab mounted hidden becomes
    // visible; `initialMode` is a one-shot seed FileView reads only at mount.
    function resolve(
        tab: Tab,
        isActive: boolean,
    ): { component: Component<any>; props: Record<string, any> } {
        const view = currentViewOf(tab);
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
    <div class="tab-panes" class:split={isSplit($tabs)}>
        {#each $tabs.tabs as tab (tab.id)}
            {@const side = paneSideOf(tab, $tabs)}
            {@const resolved = resolve(tab, side !== null)}
            {@const Active = resolved.component}
            <!-- Clicking anywhere in a pane focuses it (capture phase so the
                 editor still receives the event). Background tabs (side===null)
                 stay mounted but display:none to preserve their state. -->
            <div
                class="tab-pane"
                class:visible={side !== null}
                class:left={side === "left"}
                class:right={side === "right"}
                onpointerdowncapture={() => {
                    // Only when split, and only when focus actually moves — a
                    // store update notifies subscribers even if the state is
                    // unchanged, so guard the no-op clicks.
                    if ($tabs.panes.length < 2) return;
                    const pi = $tabs.panes.indexOf(tab.id);
                    if (pi !== -1 && pi !== $tabs.focused) tabs.focusPane(pi);
                }}
            >
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
        {#if isSplit($tabs)}
            <div
                class="pane-focus-accent"
                class:right={$tabs.focused === 1}
            ></div>
            <div class="pane-divider"></div>
            <button
                class="pane-close left"
                title="Close left pane"
                aria-label="Close left pane"
                onclick={() => tabs.closePane(0)}
            >
                <Icon type="close" />
            </button>
            <button
                class="pane-close right"
                title="Close right pane"
                aria-label="Close right pane"
                onclick={() => tabs.closePane(1)}
            >
                <Icon type="close" />
            </button>
        {/if}
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
    /* Background tabs stay mounted (state preserved) but hidden. Visible panes
       are positioned by absolute geometry so each tab stays mounted exactly
       once and just moves between full / left-half / right-half regions. */
    .tab-pane {
        position: absolute;
        inset: 0;
        display: none;
        /* Contain each pane's internal z-indexes (e.g. ViewHeader's z-index:20)
           in its own stacking context. Without this the pane — position:absolute
           with z-index:auto — is NOT a stacking context, so those descendants
           escape into the .tab-panes layer and paint over the pane-divider and
           pane-close overlays, swallowing clicks on the close buttons. */
        isolation: isolate;
    }
    .tab-pane.visible {
        display: flex;
        flex-direction: column;
    }
    .tab-panes.split .tab-pane.left {
        right: 50%;
    }
    .tab-panes.split .tab-pane.right {
        left: 50%;
    }
    /* Accent rule marking the focused pane. Lives in the chrome layer (above the
       isolated panes) so it shows over a view's own header instead of behind it. */
    .pane-focus-accent {
        position: absolute;
        top: 0;
        left: 0;
        right: 50%;
        height: 2px;
        background: var(--color-accent-primary);
        z-index: 4;
        pointer-events: none;
    }
    .pane-focus-accent.right {
        left: 50%;
        right: 0;
    }
    .pane-divider {
        position: absolute;
        top: 0;
        bottom: 0;
        left: calc(50% - 0.5px);
        width: 1px;
        background: var(--color-border-primary);
        z-index: 2;
        pointer-events: none;
    }
    /* Hidden until the editor area is hovered, and non-interactive while hidden
       so they never swallow clicks on a view's own header controls beneath. */
    .pane-close {
        position: absolute;
        top: 4px;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 4px;
        background: var(--color-background-secondary);
        color: var(--color-text-secondary);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.12s ease;
        cursor: pointer;
        z-index: 3;
    }
    .tab-panes.split:hover .pane-close {
        opacity: 0.55;
        pointer-events: auto;
    }
    .tab-panes.split .pane-close:hover {
        opacity: 1;
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
    }
    .pane-close.left {
        left: calc(50% - 28px);
    }
    .pane-close.right {
        right: 4px;
    }
</style>
