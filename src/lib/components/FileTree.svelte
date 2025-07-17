<script lang="ts">
    import type { FileNode, PageHeader } from "$lib/bindings";
    import type { ContextMenuHandler } from "$lib/types";
    import { currentView } from "$lib/viewStores";
    import FileTree from "./FileTree.svelte";
    import { promptAndCreateItem } from "$lib/actions";
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
    }
    .directory:hover,
    .file:hover {
        background-color: var(--parchment-mid);
    }
    .file.active {
        background-color: var(--parchment-dark);
        color: var(--ink);
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
