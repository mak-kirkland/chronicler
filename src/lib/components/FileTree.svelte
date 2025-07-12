<script lang="ts">
    import type { FileNode, PageHeader } from "$lib/bindings";
    import type { ContextMenuHandler } from "$lib/types";
    import { currentView } from "$lib/stores";
    import FileTree from "./FileTree.svelte";

    let { node, onContextMenu } = $props<{
        node: FileNode;
        onContextMenu: ContextMenuHandler;
    }>();
    let expanded = $state(false);

    function openFile(file: PageHeader) {
        currentView.set({ type: "file", data: file });
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
            <span class="icon">{expanded ? "▼" : "►"}</span>
            <span>{node.name}</span>
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
</style>
