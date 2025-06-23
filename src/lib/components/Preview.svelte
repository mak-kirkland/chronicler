<!-- Markdown preview with wikilink handling -->
<script lang="ts">
    import { appState } from '../state/appState.svelte';
    import { processWikilinks, handleWikilinkClick } from '../utils/wikilink';

    // DOM reference
    let previewRef: HTMLDivElement;

    // Process content when it changes
    $effect(() => {
        if (previewRef && appState.parsedContent) {
            // Process wikilinks in the HTML
            const processedHtml = processWikilinks(appState.parsedContent.html);
            previewRef.innerHTML = processedHtml;
        }
    });

    // Attach click handlers
    $effect(() => {
        if (!previewRef) return;

        previewRef.addEventListener('click', handleWikilinkClick);
        return () => {
            previewRef.removeEventListener('click', handleWikilinkClick);
        };
    });
</script>

<div class="preview-container">
    <!-- Preview header -->
    <div class="preview-header">
        <h3>Preview</h3>
        {#if appState.parsedContent}
            <div class="preview-meta">
                <!-- Show tags if any -->
                {#if appState.parsedContent.tags.length > 0}
                    <div class="tags">
                        {#each appState.parsedContent.tags as tag}
                            <span class="tag">#{tag}</span>
                        {/each}
                    </div>
                {/if}

                <!-- Show wikilinks count -->
                {#if appState.parsedContent.wikilinks.length > 0}
                    <div class="links-count">
                        {appState.parsedContent.wikilinks.length} link{appState.parsedContent.wikilinks.length === 1 ? '' : 's'}
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    <!-- Preview content -->
    <div
        bind:this={previewRef}
        class="markdown-preview"
    >
        {#if !appState.activePath}
            <div class="no-file">Select a file to see preview</div>
        {:else if !appState.parsedContent}
            <div class="loading">Loading preview...</div>
        {/if}
    </div>
</div>

<style>
    .markdown-preview {
        font-family: 'Merriweather', serif;
        line-height: 1.6;
        color: var(--text-primary);
        padding: 15px;
        height: 100%;
        overflow-y: auto;
    }

    .markdown-preview h1,
    .markdown-preview h2,
    .markdown-preview h3 {
        color: var(--accent-color);
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 5px;
    }

    .markdown-preview a {
        color: var(--link-color);
        text-decoration: none;
    }

    .markdown-preview a:hover {
        text-decoration: underline;
    }

    .markdown-preview code {
        background: var(--bg-secondary);
        padding: 2px 5px;
        border-radius: 3px;
        font-family: 'Fira Code', monospace;
    }

    .markdown-preview pre {
        background: var(--bg-secondary);
        padding: 15px;
        border-radius: 5px;
        overflow-x: auto;
    }

    .markdown-preview table {
        border-collapse: collapse;
        width: 100%;
        margin: 20px 0;
    }

    .markdown-preview th {
        background: var(--bg-secondary);
        color: var(--accent-color);
    }

    .markdown-preview td,
    .markdown-preview th {
        border: 1px solid var(--border-color);
        padding: 8px;
        text-align: left;
    }

    .wikilink {
        color: var(--tag-color) !important;
        font-weight: bold;
    }
</style>