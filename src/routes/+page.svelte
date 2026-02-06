<script lang="ts">
    import type { Component } from "svelte";
    import { currentView, fileViewMode, rightSidebar } from "$lib/viewStores";

    // Import all possible main view components
    import WelcomeView from "$lib/components/views/WelcomeView.svelte";
    import TagIndexView from "$lib/components/views/TagIndexView.svelte";
    import FileView from "$lib/components/views/FileView.svelte";
    import ImageView from "$lib/components/views/ImageView.svelte";
    import MapView from "$lib/components/map/MapView.svelte";
    import BacklinksPanel from "$lib/components/views/BacklinksPanel.svelte";
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

    // This reactive block determines which component and props to render
    // based on the current state of the `currentView` store.
    const activeView = $derived(() => {
        const view = $currentView;
        let key: string = view.type;
        let props: Record<string, any> = {};

        switch (view.type) {
            case "file":
                props = { file: view.data, sectionId: view.sectionId };
                break;
            case "image":
                props = { data: view.data };
                break;
            case "map":
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

        return {
            component: componentMap[key],
            props: props,
        };
    });

    // In Svelte 5, we can derive values directly from other derived signals.
    const ActiveComponent = $derived(activeView().component);
    const props = $derived(activeView().props);

    // This effect resets the file view mode and hides the right sidebar
    // whenever the user navigates away from the file view.
    $effect(() => {
        if ($currentView.type !== "file") {
            $fileViewMode = "preview";
            rightSidebar.update((state) => ({ ...state, isVisible: false }));
        }
    });
</script>

<!-- Use the variable directly as a component tag, which is the Svelte 5 way. -->
{#if ActiveComponent}
    <ActiveComponent {...props} />
{/if}

{#if $rightSidebar.isVisible}
    <BacklinksPanel />
{/if}
