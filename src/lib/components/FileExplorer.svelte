<script lang="ts">
    import { files, isWorldLoaded, vaultPath } from "$lib/worldStore";
    import { filterFileTree } from "$lib/utils";
    import type { FileNode } from "$lib/bindings";
    import { getContextMenuActions } from "$lib/contextMenuActions";
    import { moveItemToDir } from "$lib/actions";
    import { droppable } from "$lib/domActions";
    import { isDragging } from "$lib/dragStore";

    // Import components needed for the view
    import FileTree from "./FileTree.svelte";
    import ContextMenu from "./ContextMenu.svelte";

    // This component receives the search term from its parent (Sidebar).
    let { searchTerm = "" } = $props<{ searchTerm?: string }>();
    // Local type to keep track of where we want to open the context menu
    type ContextMenuState = { x: number; y: number; node: FileNode };
    // State that our FileTree will update
    let contextMenu = $state<ContextMenuState | null>(null);

    // Create a derived value for the filtered file tree.
    // This will automatically re-calculate whenever the fileTree store or searchTerm changes.
    const filteredNode = $derived(filterFileTree($files, searchTerm));

    function showContextMenu(event: MouseEvent, node: FileNode) {
        contextMenu = { x: event.clientX, y: event.clientY, node };
    }

    function closeContextMenu() {
        contextMenu = null;
    }

    async function handleRootDrop(e: CustomEvent<{ sourcePath: string }>) {
        const { sourcePath } = e.detail;
        const destinationDir = $vaultPath;

        if (!sourcePath || !destinationDir) {
            console.error("Drop failed: Missing source or destination path.");
            return;
        }

        const parentDir = sourcePath.substring(0, sourcePath.lastIndexOf("/"));
        if (parentDir === destinationDir) {
            console.warn("Item is already in the root directory.");
            return;
        }

        try {
            await moveItemToDir(sourcePath, destinationDir);
        } catch (err) {
            console.error("The root drop operation failed in the UI.", err);
        }
    }
</script>

{#if contextMenu}
    <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        actions={getContextMenuActions(contextMenu.node)}
        onClose={closeContextMenu}
    />
{/if}

<div class="explorer-container">
    <!--
	The drop zone is always in the DOM. When draing, animate its height
	to "push" the content down, creating a gap to drop into.
      -->
    <div
        class="root-drop-zone"
        class:visible={$isDragging}
        use:droppable
        onfilesdropped={handleRootDrop}
    >
        Drop here to move to root
    </div>

    <!-- The file tree is rendered below the drop zone -->
    <div class="file-tree-container">
        <!--
            Instead of rendering the root node, we now check if it has children
            and iterate over them directly. This hides the root and shows the
            first level of the vault.
          -->
        {#if filteredNode && filteredNode.children && filteredNode.children.length > 0}
            {#each filteredNode.children as child (child.path)}
                <FileTree node={child} onContextMenu={showContextMenu} />
            {/each}
        {:else if searchTerm}
            <p class="text-muted text-center">No files found.</p>
        {:else if $isWorldLoaded}
            <p class="text-muted text-center">Your vault is empty.</p>
        {:else}
            <p>Loading files...</p>
        {/if}
    </div>
</div>

<style>
    .explorer-container {
        height: 100%;
        width: 100%;
        box-sizing: border-box;
        padding: 0.5rem;
        display: flex;
        flex-direction: column;
    }
    .root-drop-zone {
        /* It's always in the layout, but collapsed to zero height */
        max-height: 0;
        padding-top: 0;
        padding-bottom: 0;
        margin-bottom: 0;
        border-width: 0;
        opacity: 0;
        overflow: hidden;

        /* Common styles */
        display: flex;
        flex-shrink: 0; /* Prevent the drop zone from shrinking */
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        border-style: dashed;
        border-color: transparent;
        color: var(--text-muted);
        font-size: 0.9rem;

        /* Smooth transition for the "opening" animation */
        transition: all 0.2s ease-in-out;
    }
    /* This class makes the drop zone expand to its full size */
    .root-drop-zone.visible {
        max-height: 100px; /* Animate to a height large enough for the content */
        padding: 1rem;
        margin-bottom: 0.5rem;
        border-width: 2px;
        opacity: 1;
        border-color: var(--border-color);
    }
    /* Highlight the drop zone when an item is dragged over it */
    .root-drop-zone:global(.drop-target) {
        background-color: var(--parchment-mid);
        border-color: var(--ink);
        color: var(--ink);
    }
    .file-tree-container {
        flex-grow: 1;
        overflow-y: auto;
        overflow-x: hidden;
    }
    .text-muted.text-center {
        margin-top: 1rem;
        padding: 0.5rem;
    }
</style>
