<script lang="ts">
    import FileExplorer from "$lib/components/FileExplorer.svelte";
    import Editor from "$lib/components/Editor.svelte";
    import Preview from "$lib/components/Preview.svelte";
    import { getFileContent } from "$lib/utils/tauri";

    // Editor state
    let editorState = $state({
        activePath: null as string | null,
        content: "",
        showPreview: true
    });

    // Handle file selection
    async function handleFileSelect(path: string) {
        try {
            editorState.activePath = path;
            editorState.content = await getFileContent(path);
        } catch (err) {
            console.error(`Error loading file: ${err}`);
        }
    }
</script>

<div class="main-layout">
    <aside class="sidebar">
        <FileExplorer on:fileSelect={handleFileSelect} />
    </aside>

    <main class="content-area">
        <div class="editor-pane">
            <Editor
                content={editorState.content}
                activePath={editorState.activePath}
            />
        </div>

        {#if editorState.showPreview}
            <div class="preview-pane">
                <Preview content={editorState.content} />
            </div>
        {/if}
    </main>
</div>

<style>
    .main-layout {
        display: flex;
        height: 100%;
        width: 100%;
    }

    .sidebar {
        width: 250px;
        background: var(--bg-secondary);
        border-right: 1px solid var(--border-color);
    }

    .content-area {
        flex: 1;
        display: flex;
        overflow: hidden;
    }

    .editor-pane {
        flex: 1;
        display: flex;
        flex-direction: column;
    }

    .preview-pane {
        flex: 1;
        border-left: 1px solid var(--border-color);
    }
</style>