<script lang="ts">
    import type { FileNode, PageHeader } from "$lib/bindings";
    import type { ContextMenuHandler } from "$lib/types";
    import { currentView } from "$lib/viewStores";
    import FileTree from "./FileTree.svelte";
    import { promptAndCreateItem, moveItemToDir } from "$lib/actions";
    import { draggable, droppable } from "$lib/domActions";
    import Button from "./Button.svelte";

    let { node, onContextMenu } = $props<{
        node: FileNode;
        onContextMenu: ContextMenuHandler;
    }>();

    let expanded = $state(false);

    function openFile(file: PageHeader) {
        currentView.set({ type: "file", data: file });
    }

    function handleNewFile(e: MouseEvent) {
        e.stopPropagation(); // Prevent the directory from expanding/collapsing
        promptAndCreateItem("file", node.path);
    }

    function handleNewFolder(e: MouseEvent) {
        e.stopPropagation(); // Prevent the directory from expanding/collapsing
        promptAndCreateItem("folder", node.path);
    }

    // This handler receives the custom event from our `droppable` action.
    async function handleFilesDropped(e: CustomEvent<{ sourcePath: string }>) {
        const { sourcePath } = e.detail;
        const destinationDir = node.path;

        // Perform validation before calling the move action
        if (
            !sourcePath ||
            sourcePath === destinationDir ||
            destinationDir.startsWith(sourcePath + "/")
        ) {
            console.warn("Invalid move: Cannot move a folder into itself.");
            return;
        }

        try {
            await moveItemToDir(sourcePath, destinationDir);
        } catch (err) {
            console.error("The move operation failed in the UI.", err);
        }
    }
</script>

<div class="file-node">
    {#if node.is_directory}
        <div
            class="directory"
            onclick={() => (expanded = !expanded)}
            onkeydown={(e) => e.key === "Enter" && (expanded = !expanded)}
            role="button"
            tabindex="0"
            oncontextmenu={(e) => {
                e.preventDefault();
                onContextMenu(e, node);
            }}
            use:draggable={{ path: node.path }}
            use:droppable
            onfilesdropped={handleFilesDropped}
        >
            <div class="label">
                <span class="icon">{expanded ? "▼" : "►"}</span>
                <span>{node.name}</span>
            </div>
            <div class="quick-actions">
                <Button
                    variant="ghost"
                    class="quick-action-btn"
                    title="New Page in '{node.name}'"
                    onclick={handleNewFile}
                >
                    +📄
                </Button>
                <Button
                    variant="ghost"
                    class="quick-action-btn"
                    title="New Folder in '{node.name}'"
                    onclick={handleNewFolder}
                >
                    +📁
                </Button>
            </div>
        </div>
        {#if expanded && node.children}
            <div class="children">
                {#each node.children as child (child.path)}
                    <FileTree node={child} {onContextMenu} />
                {/each}
            </div>
        {/if}
    {:else}
        <div
            class="file"
            class:active={$currentView.type === "file" &&
                $currentView.data?.path === node.path}
            onclick={() => openFile({ title: node.name, path: node.path })}
            onkeydown={(e) =>
                e.key === "Enter" &&
                openFile({ title: node.name, path: node.path })}
            role="button"
            tabindex="0"
            oncontextmenu={(e) => {
                e.preventDefault();
                onContextMenu(e, node);
            }}
            use:draggable={{ path: node.path }}
        >
            <span class="icon">📜</span>
            <span>{node.name}</span>
        </div>
    {/if}
</div>

<style>
    .file-node {
        font-size: 0.95rem;
    }
    .directory,
    .file {
        padding: 0.25rem 0.5rem;
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
        background-color: var(--parchment-mid);
    }
    .file.active {
        background-color: var(--parchment-dark);
        color: var(--ink);
    }
    /* The class is applied by the "droppable" action, not the component,
       so make the style global to ensure that it's applied */
    .directory:global(.drop-target) {
        background-color: var(--parchment-dark);
        box-shadow: inset 0 0 0 2px var(--ink);
        transform: scale(1.02);
    }
    .children {
        padding-left: 1rem;
        border-left: 1px solid var(--border-color);
        margin-left: 0.5rem;
    }
    .icon {
        opacity: 0.7;
        font-size: 0.8em;
    }
    .label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-grow: 1;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }
    .quick-actions {
        display: flex;
        align-items: center;
        visibility: hidden;
        flex-shrink: 0;
    }
    .directory:hover .quick-actions {
        visibility: visible;
    }

    /* Use :global() to override the styles of the child Button component */
    :global(.quick-action-btn) {
        font-size: 1em !important;
        padding: 0 0.3rem !important;
        line-height: 1 !important;
    }
</style>
