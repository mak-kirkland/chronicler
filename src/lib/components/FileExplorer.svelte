<!-- File explorer component with proper integration -->
<script lang="ts">
    import { appState } from '../state/appState.svelte';
    import type { FileIndex } from '../types';

    // Props
    let { files = appState.fileIndex, level = 0 } = $props<{
        files?: FileIndex[];
        level?: number;
    }>();

    // Local state for directory expansion
    let expandedPaths = $state<Set<string>>(new Set([''])); // Root expanded by default

    // Toggle directory expansion
    function toggleDirectory(path: string) {
        if (expandedPaths.has(path)) {
            expandedPaths.delete(path);
        } else {
            expandedPaths.add(path);
        }
        expandedPaths = new Set(expandedPaths); // Trigger reactivity
    }

    // Handle file selection
    function handleFileSelect(path: string) {
        appState.setActiveFile(path);
    }

    // Create new file
    async function createNewFile() {
        const fileName = prompt('Enter file name (with .md extension):');
        if (fileName) {
            await appState.createNewFile(fileName);
        }
    }

    // Refresh file tree
    async function refreshFiles() {
        await appState.refresh();
    }
</script>

<div class="file-explorer">
    <!-- Header with actions -->
    <div class="explorer-header">
        <h3>Files</h3>
        <div class="explorer-actions">
            <button on:click={createNewFile} title="New File">📄</button>
            <button on:click={refreshFiles} title="Refresh">🔄</button>
        </div>
    </div>

    <!-- Loading/Error states -->
    {#if appState.isLoading}
        <div class="loading">Loading file structure...</div>
    {:else if appState.error}
        <div class="error">{appState.error}</div>
    {:else}
        <!-- File tree -->
        <div class="file-tree">
            {#each files as item (item.path)}
                <div
                    class="file-item"
                    class:directory={item.isDirectory}
                    class:active={appState.activePath === item.path}
                    style="padding-left: {level * 20}px"
                >
                    {#if item.isDirectory}
                        <button
                            class="directory-toggle"
                            on:click={() => toggleDirectory(item.path)}
                        >
                            <span class="icon">
                                {expandedPaths.has(item.path) ? '📂' : '📁'}
                            </span>
                            <span class="name">{item.name}</span>
                        </button>

                        <!-- Recursively render children if expanded -->
                        {#if expandedPaths.has(item.path) && item.children}
                            <svelte:self files={item.children} level={level + 1} />
                        {/if}
                    {:else}
                        <button
                            class="file-button"
                            on:click={() => handleFileSelect(item.path)}
                        >
                            <span class="icon">📄</span>
                            <span class="name">{item.name}</span>
                        </button>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .file-explorer {
        font-family: 'Fira Code', monospace;
        font-size: 13px;
        background: var(--bg-secondary, #f5f5f5);
        height: 100%;
        overflow-y: auto;
        border-right: 1px solid var(--border-color, #ddd);
    }

    .explorer-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        border-bottom: 1px solid var(--border-color, #ddd);
        background: var(--bg-primary, white);
    }

    .explorer-header h3 {
        margin: 0;
        font-size: 14px;
        color: var(--text-primary, #333);
    }

    .explorer-actions {
        display: flex;
        gap: 5px;
    }

    .explorer-actions button {
        background: none;
        border: 1px solid var(--border-color, #ddd);
        border-radius: 3px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 12px;
    }

    .explorer-actions button:hover {
        background: var(--bg-secondary, #f5f5f5);
    }

    .file-tree {
        padding: 5px 0;
    }

    .file-item {
        margin: 1px 0;
    }

    .directory-toggle,
    .file-button {
        width: 100%;
        background: none;
        border: none;
        text-align: left;
        cursor: pointer;
        padding: 4px 8px;
        display: flex;
        align-items: center;
        font-family: inherit;
        font-size: inherit;
        color: var(--text-primary, #333);
    }

    .directory-toggle:hover,
    .file-button:hover {
        background: var(--bg-hover, #e8e8e8);
    }

    .file-item.active .file-button {
        background: var(--accent-color, #007acc);
        color: white;
    }

    .icon {
        margin-right: 8px;
        font-size: 14px;
    }

    .name {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .directory {
        font-weight: 500;
    }

    .loading,
    .error {
        padding: 20px;
        text-align: center;
        color: var(--text-secondary, #666);
        font-style: italic;
    }

    .error {
        color: var(--error-color, #d32f2f);
    }
</style>