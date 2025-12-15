<script lang="ts">
    import type { FileNode } from "$lib/bindings";
    import type { ContextMenuHandler } from "$lib/types";
    import { currentView } from "$lib/viewStores";
    import { manuallyExpandedPaths } from "$lib/explorerStore";
    import {
        promptAndCreateItem,
        movePath,
        navigateToPage,
        navigateToImage,
    } from "$lib/actions";
    import { draggable, droppable } from "$lib/domActions";
    import FileTree from "./FileTree.svelte";
    import Button from "./Button.svelte";
    import Icon from "./Icon.svelte";
    import { isDirectory, isImage, isMarkdown } from "$lib/utils";
    let {
        node,
        onContextMenu,
        searchTerm = "",
    } = $props<{
        node: FileNode;
        onContextMenu: ContextMenuHandler;
        searchTerm?: string;
    }>();

    const isSearching = $derived(!!searchTerm);
    const isManuallyExpanded = $derived($manuallyExpandedPaths.has(node.path));
    // A folder is expanded if we are searching OR if it's in our global set
    const expanded = $derived(isSearching || isManuallyExpanded);

    /**
     * Handles a click on any non-directory node, routing to the correct
     * view based on the file type. Note the capitalized enum variant names.
     */
    function handleNodeClick(node: FileNode) {
        if (isMarkdown(node)) {
            navigateToPage({ title: node.name, path: node.path });
        } else if (isImage(node)) {
            navigateToImage({ title: node.name, path: node.path });
        }
    }

    function handleNewFile(e: MouseEvent) {
        e.stopPropagation();
        // Prevent the directory from expanding/collapsing
        promptAndCreateItem("file", node.path);
    }

    function handleNewFolder(e: MouseEvent) {
        e.stopPropagation();
        // Prevent the directory from expanding/collapsing
        promptAndCreateItem("folder", node.path);
    }

    // This handler receives the custom event from our `droppable` action.
    async function handleFilesDropped(e: CustomEvent<{ sourcePath: string }>) {
        const { sourcePath } = e.detail;
        const destinationDir = node.path;

        await movePath(sourcePath, destinationDir);
    }
</script>

<div class="file-node">
    {#if isDirectory(node)}
        <div
            class="directory"
            onclick={() => manuallyExpandedPaths.toggle(node.path)}
            onkeydown={(e) =>
                e.key === "Enter" && manuallyExpandedPaths.toggle(node.path)}
            role="button"
            tabindex="0"
            oncontextmenu={(e) => {
                onContextMenu(e, node);
            }}
            use:draggable={node.path}
            use:droppable
            onfilesdropped={handleFilesDropped}
        >
            <div class="label">
                <!-- Structural arrow and themed folder icon next to it -->
                <span class="arrow-icon">{expanded ? "▼" : "►"}</span>
                <Icon type={expanded ? "folderOpen" : "folder"} />
                <span class="node-name-text">{node.name}</span>
            </div>
            <div class="quick-actions">
                <Button
                    variant="ghost"
                    class="quick-action-btn"
                    title="New Page"
                    onclick={handleNewFile}
                >
                    <Icon type="newFile" />
                </Button>
                <Button
                    variant="ghost"
                    class="quick-action-btn"
                    title="New Folder"
                    onclick={handleNewFolder}
                >
                    <Icon type="newFolder" />
                </Button>
            </div>
        </div>
        {#if expanded && node.children}
            <div class="children">
                {#each node.children as child (child.path)}
                    <FileTree node={child} {onContextMenu} {searchTerm} />
                {/each}
            </div>
        {/if}
    {:else}
        <div
            class="file"
            class:active={($currentView.type === "file" ||
                $currentView.type === "image") &&
                $currentView.data?.path === node.path}
            onclick={() => handleNodeClick(node)}
            onkeydown={(e) => e.key === "Enter" && handleNodeClick(node)}
            role="button"
            tabindex="0"
            oncontextmenu={(e) => {
                onContextMenu(e, node);
            }}
            use:draggable={node.path}
        >
            <Icon type={isImage(node) ? "image" : "file"} />
            <span class="node-name-text">{node.name}</span>
        </div>
    {/if}
</div>

<style>
    .file-node {
        font-size: 0.95rem;
    }
    .directory,
    .file {
        padding: 0.25rem 0.6rem;
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        user-select: none;
        justify-content: space-between;
        /* Add a transition for smoother visual feedback */
        transition:
            background-color 0.2s ease-in-out,
            box-shadow 0.2s ease-in-out,
            transform 0.15s ease-in-out;
    }
    .directory:hover,
    .file:hover {
        background-color: var(--color-background-secondary);
        /* Ensure hovered items stack on top of siblings to prevent
           dropdowns/effects from being clipped or overlapped */
        position: relative;
        z-index: 10;
    }
    .file.active {
        background-color: var(--color-background-tertiary);
        color: var(--color-text-primary);
    }
    /* The class is applied by the "droppable" action, not the component,
       so make the style global to ensure that it's applied */
    .directory:global(.drop-target) {
        background-color: var(--color-background-tertiary);
        box-shadow: inset 0 0 0 2px var(--color-text-primary);
        transform: scale(1.02);
        z-index: 10;
    }
    .children {
        padding-left: 1rem;
        border-left: 1px solid var(--color-border-primary);
        margin-left: 0.5rem;
    }
    .arrow-icon {
        opacity: 0.7;
        font-size: 0.8em;
        width: 1em; /* Fixed width to align icons */
        text-align: center;
    }
    .label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-grow: 1;
        overflow: hidden;
    }
    /* This base class only handles layout, ensuring both
       file and folder names can grow and wrap correctly. */
    .node-name-text {
        flex-grow: 1; /* Allows the span to fill the available space */
    }
    .file .node-name-text {
        /* Remove text-align right to align nicely with the icon on the left */
        text-align: left;
    }
    .quick-actions {
        display: flex;
        align-items: center;
        flex-shrink: 0;
        opacity: 0;
        max-width: 0;
        overflow: hidden; /* Ensures content doesn't spill out during transition */
    }
    .directory:hover .quick-actions {
        opacity: 1;
        max-width: 100px; /* A value large enough for the buttons */
        /* Allow overflow on hover so that button effects (glows, transforms)
           aren't clipped by the container bounds. */
        overflow: visible;
    }

    /* Use :global() to override the styles of the child Button component */
    :global(.quick-action-btn) {
        font-size: 1em !important;
        padding: 0 0.3rem !important;
        line-height: 1 !important;
    }
</style>
