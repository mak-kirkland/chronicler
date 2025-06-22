<script lang="ts">
    import { processWikilinks, handleWikilinkClick } from "$lib/utils/wikilink";

    // Props
    let { content = "" } = $props();

    // DOM reference
    let previewRef: HTMLDivElement;

    // Process wikilinks when content changes
    $effect(() => {
        if (previewRef && content) {
            previewRef.innerHTML = processWikilinks(content);
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

<div class="markdown-preview" bind:this={previewRef}>
    {@html content}
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