<script lang="ts">
    import { files, isWorldLoaded } from "$lib/worldStore";
    import { filterFileTree } from "$lib/utils";
    import type { FileNode } from "$lib/bindings";
    import { getContextMenuActions } from "$lib/contextMenuActions";

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
    {#if filteredNode}
        <FileTree node={filteredNode} onContextMenu={showContextMenu} />
    {:else if searchTerm}
        <p class="no-results">No files found.</p>
    {:else if $isWorldLoaded}
        <p class="no-results">Your vault is empty.</p>
    {:else}
        <p>Loading files...</p>
    {/if}
</div>

<style>
    .explorer-container {
        height: 100%;
        width: 100%;
    }
    .no-results {
        color: var(--ink-light);
        text-align: center;
        font-style: italic;
        margin-top: 1rem;
    }
</style>
