<script lang="ts">
    import { appState } from "$lib/state/appState.svelte";

    // Props
    let { expanded = false } = $props();

    // Local state
    let openPaths = $state(new Set<string>());

    // Initialize when app state is ready
    $effect(() => {
        if (!appState.isLoading && !appState.error) {
            // Expand root by default
            openPaths.add("");
        }
    });

    // Toggle directory expansion
    const toggleDirectory = (path: string) => {
        if (openPaths.has(path)) {
            openPaths.delete(path);
        } else {
            openPaths.add(path);
        }
    };
</script>

<div class="file-explorer">
    {#if appState.isLoading}
        <div class="loading">Loading file structure...</div>
    {:else if appState.error}
        <div class="error">{appState.error}</div>
    {:else}
        <ul>
            {#each appState.fileIndex as item (item.path)}
                <li class:directory={item.isDirectory} class:file={!item.isDirectory}>
                    {#if item.isDirectory}
                        <button on:click={() => toggleDirectory(item.path)}>
                            <span class="icon">{openPaths.has(item.path) ? "📂" : "📁"}</span>
                            {item.name}
                        </button>

                        {#if openPaths.has(item.path)}
                            <FileExplorer node={item} expanded={true} />
                        {/if}
                    {:else}
                        <button on:click={() => handleFileSelect(item.path)}>
                            <span class="icon">📄</span>
                            {item.name}
                        </button>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .file-explorer {
        font-family: monospace;
        padding: 10px;
        background: var(--bg-secondary);
        height: 100%;
        overflow-y: auto;
    }

    ul {
        list-style: none;
        padding-left: 15px;
        margin: 0;
    }

    li {
        margin: 5px 0;
    }

    button {
        background: none;
        border: none;
        text-align: left;
        cursor: pointer;
        padding: 5px;
        width: 100%;
        display: flex;
        align-items: center;
    }

    .icon {
        margin-right: 8px;
    }

    .directory {
        font-weight: bold;
    }
</style>