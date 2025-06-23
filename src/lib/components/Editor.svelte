<!-- Markdown editor with auto-save -->
<script lang="ts">
    import { appState } from '../state/appState.svelte';

    // Local editor state
    let textareaRef: HTMLTextAreaElement;
    let localContent = $state('');
    let lastSaveContent = $state('');

    // Sync with app state
    $effect(() => {
        localContent = appState.activeContent;
        lastSaveContent = appState.activeContent;
    });

    // Update app state when local content changes
    $effect(() => {
        appState.activeContent = localContent;
    });

    // Auto-save after 1 second of inactivity
    $effect(() => {
        if (!appState.activePath || localContent === lastSaveContent) {
            return;
        }

        const timer = setTimeout(async () => {
            await appState.saveCurrentFile();
            lastSaveContent = localContent;
        }, 1000);

        return () => clearTimeout(timer);
    });

    // Handle keyboard shortcuts
    function handleKeydown(event: KeyboardEvent) {
        // Ctrl/Cmd + S to save
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            appState.saveCurrentFile();
        }

        // Ctrl/Cmd + P to toggle preview
        if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
            event.preventDefault();
            appState.togglePreview();
        }
    }

    // Insert text at cursor position
    function insertText(text: string) {
        if (!textareaRef) return;

        const start = textareaRef.selectionStart;
        const end = textareaRef.selectionEnd;

        localContent = localContent.slice(0, start) + text + localContent.slice(end);

        // Restore cursor position
        setTimeout(() => {
            textareaRef.selectionStart = start + text.length;
            textareaRef.selectionEnd = start + text.length;
            textareaRef.focus();
        });
    }

    // Quick formatting buttons
    function insertBold() { insertText('**bold**'); }
    function insertItalic() { insertText('*italic*'); }
    function insertLink() { insertText('[link text](url)'); }
    function insertWikilink() { insertText('[[Page Name]]'); }
    function insertTag() { insertText('#tag'); }
    function insertInfobox() {
        insertText('```infobox\nname: Character Name\nrace: Human\nclass: Fighter\n```\n\n');
    }
</script>

<div class="editor-container">
    <!-- Toolbar -->
    <div class="editor-toolbar">
        <div class="toolbar-group">
            <button on:click={insertBold} title="Bold (Ctrl+B)">B</button>
            <button on:click={insertItalic} title="Italic (Ctrl+I)">I</button>
            <button on:click={insertLink} title="Link">🔗</button>
        </div>

        <div class="toolbar-group">
            <button on:click={insertWikilink} title="Wikilink">[[]]</button>
            <button on:click={insertTag} title="Tag">#</button>
            <button on:click={insertInfobox} title="Infobox">📋</button>
        </div>

        <div class="toolbar-group">
            <button
                on:click={appState.togglePreview}
                class:active={appState.showPreview}
                title="Toggle Preview (Ctrl+P)"
            >
                👁️
            </button>
        </div>
    </div>

    <!-- Editor -->
    <textarea
        bind:this={textareaRef}
        bind:value={localContent}
        on:keydown={handleKeydown}
        class="markdown-editor"
        placeholder={appState.activePath
            ? "Start writing your world..."
            : "Select a file to start editing"}
        disabled={!appState.activePath}
    />

    <!-- Status bar -->
    <div class="status-bar">
        <span class="file-path">{appState.activePath || 'No file selected'}</span>

        <div class="status-right">
            {#if appState.isSaving}
                <span class="status-saving">Saving...</span>
            {:else if appState.saveStatus}
                <span class:status-success={appState.saveStatus === 'Saved!'}>
                    {appState.saveStatus}
                </span>
            {/if}
        </div>
    </div>
</div>

<style>
    .editor-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--bg-primary, white);
    }

    .editor-toolbar {
        display: flex;
        gap: 10px;
        padding: 8px;
        background: var(--bg-secondary, #f5f5f5);
        border-bottom: 1px solid var(--border-color, #ddd);
        flex-wrap: wrap;
    }

    .toolbar-group {
        display: flex;
        gap: 4px;
    }

    .editor-toolbar button {
        background: white;
        border: 1px solid var(--border-color, #ddd);
        border-radius: 3px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 12px;
        font-family: 'Fira Code', monospace;
        min-width: 24px;
    }

    .editor-toolbar button:hover {
        background: var(--bg-hover, #e8e8e8);
    }

    .editor-toolbar button.active {
        background: var(--accent-color, #007acc);
        color: white;
        border-color: var(--accent-color, #007acc);
    }

    .markdown-editor {
        flex: 1;
        width: 100%;
        padding: 15px;
        font-family: 'Fira Code', monospace;
        font-size: 14px;
        line-height: 1.6;
        border: none;
        resize: none;
        background: var(--bg-primary, white);
        color: var(--text-primary, #333);
        outline: none;
    }

    .markdown-editor:disabled {
        background: var(--bg-disabled, #f9f9f9);
        color: var(--text-disabled, #999);
        cursor: not-allowed;
    }

    .status-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 5px 10px;
        font-size: 12px;
        background: var(--bg-secondary, #f5f5f5);
        border-top: 1px solid var(--border-color, #ddd);
        color: var(--text-secondary, #666);
    }

    .file-path {
        font-family: 'Fira Code', monospace;
        font-size: 11px;
    }

    .status-right {
        display: flex;
        gap: 10px;
        align-items: center;
    }

    .status-saving {
        color: var(--warning-color, #ff9800);
    }

    .status-success {
        color: var(--success-color, #4caf50);
    }
</style>