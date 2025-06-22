<script lang="ts">
    import { saveFile } from "$lib/utils/tauri";

    // Props
    let { content = "", activePath = null } = $props();

    // Editor state
    let localContent = $state(content);
    let isSaving = $state(false);
    let saveStatus = $state("");

    // Update content when prop changes
    $effect(() => {
        localContent = content;
    });

    // Auto-save handler
    $effect(() => {
        if (!activePath) return;

        const timer = setTimeout(async () => {
            isSaving = true;
            try {
                await saveFile(activePath, localContent);
                saveStatus = "Saved!";
            } catch (err) {
                saveStatus = `Save failed: ${err}`;
            } finally {
                setTimeout(() => {
                    saveStatus = "";
                    isSaving = false;
                }, 2000);
            }
        }, 1000);

        return () => clearTimeout(timer);
    });
</script>

<div class="editor-container">
    <textarea
        bind:value={localContent}
        class="markdown-editor"
        placeholder="Start writing your world..."
    />

    <div class="status-bar">
        {#if isSaving}
            <span class="saving">Saving...</span>
        {:else if saveStatus}
            <span class:success={saveStatus === "Saved!"}>{saveStatus}</span>
        {/if}
    </div>
</div>

<style>
    .editor-container {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .markdown-editor {
        width: 100%;
        height: 100%;
        padding: 15px;
        font-family: 'Fira Code', monospace;
        font-size: 14px;
        line-height: 1.6;
        border: none;
        resize: none;
        background: var(--bg-primary);
        color: var(--text-primary);
    }

    .status-bar {
        padding: 5px 10px;
        font-size: 12px;
        background: var(--bg-secondary);
        border-top: 1px solid var(--border-color);
    }

    .success {
        color: var(--success-color);
    }
</style>