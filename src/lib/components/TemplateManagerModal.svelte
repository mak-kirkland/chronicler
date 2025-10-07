<script lang="ts">
    import { onMount } from "svelte";
    import { confirm } from "@tauri-apps/plugin-dialog";
    import {
        listTemplates,
        readTemplate,
        writeTemplate,
        deleteTemplate,
    } from "$lib/commands";
    import { autofocus } from "$lib/domActions";
    import type { PageHeader } from "$lib/bindings";
    import Modal from "./Modal.svelte";
    import Button from "./Button.svelte";
    import Editor from "./Editor.svelte";

    let { onClose } = $props<{
        onClose: () => void;
    }>();

    // --- State ---
    let templates = $state<PageHeader[]>([]);
    let selectedTemplate = $state<PageHeader | null>(null);
    let editorContent = $state("");
    let originalContent = $state("");
    let isDirty = $derived(editorContent !== originalContent);
    let isLoading = $state(false);
    let error = $state<string | null>(null);

    // --- Lifecycle ---
    onMount(() => {
        loadTemplates();
    });

    // --- Data Fetching ---
    async function loadTemplates() {
        isLoading = true;
        error = null;
        try {
            templates = await listTemplates();
        } catch (e: any) {
            error = `Failed to load templates: ${e.message}`;
        } finally {
            isLoading = false;
        }
    }

    async function selectTemplate(template: PageHeader) {
        if (isDirty) {
            if (
                !(await confirm(
                    "You have unsaved changes. Are you sure you want to switch?",
                ))
            ) {
                return;
            }
        }
        selectedTemplate = template;
        isLoading = true;
        try {
            const content = await readTemplate(template.path);
            editorContent = content;
            originalContent = content;
        } catch (e: any) {
            error = `Failed to load template content: ${e.message}`;
        } finally {
            isLoading = false;
        }
    }

    // --- Actions ---
    async function handleSave() {
        if (!selectedTemplate) return;
        isLoading = true;
        try {
            await writeTemplate(selectedTemplate.title, editorContent);
            originalContent = editorContent; // Mark as no longer dirty
            await loadTemplates(); // Refresh list in case of rename
        } catch (e: any) {
            error = `Failed to save template: ${e.message}`;
        } finally {
            isLoading = false;
        }
    }

    function createNewTemplate() {
        const newName = "New Template";
        // A simple default template to get users started.
        const defaultContent =
            '---\ntitle: "{{title}}"\ntags: []\n---\n\nStart writing here...';

        selectedTemplate = { title: newName, path: "" }; // Path is temporary
        editorContent = defaultContent;
        originalContent = ""; // Force dirty state to encourage saving
    }

    async function handleDelete() {
        if (!selectedTemplate) return;
        if (
            await confirm(
                `Are you sure you want to delete the template "${selectedTemplate.title}"?`,
            )
        ) {
            try {
                await deleteTemplate(selectedTemplate.path);
                selectedTemplate = null;
                editorContent = "";
                originalContent = "";
                await loadTemplates();
            } catch (e: any) {
                error = `Failed to delete template: ${e.message}`;
            }
        }
    }
</script>

<Modal title="Template Manager" {onClose}>
    <div class="template-manager-container">
        <aside class="template-list-panel">
            <h4>Templates</h4>
            {#if templates.length > 0}
                <ul class="template-list">
                    {#each templates as template (template.path)}
                        <li>
                            <button
                                class="template-item"
                                class:active={selectedTemplate?.path ===
                                    template.path}
                                onclick={() => selectTemplate(template)}
                            >
                                {template.title}
                            </button>
                        </li>
                    {/each}
                </ul>
            {:else}
                <p class="no-templates-message">No templates yet.</p>
            {/if}
            <Button onclick={createNewTemplate}>+ New Template</Button>
        </aside>
        <main class="template-editor-panel">
            {#if selectedTemplate}
                <div class="editor-header">
                    <input
                        type="text"
                        bind:value={selectedTemplate.title}
                        class="template-name-input"
                        use:autofocus
                    />
                    <div class="editor-actions">
                        <Button
                            onclick={handleSave}
                            disabled={!isDirty || isLoading}>Save</Button
                        >
                        {#if selectedTemplate.path}
                            <!-- Only show delete for existing templates -->
                            <Button onclick={handleDelete} disabled={isLoading}
                                >Delete</Button
                            >
                        {/if}
                    </div>
                </div>
                <div class="editor-wrapper">
                    <Editor bind:content={editorContent} />
                </div>
            {:else}
                <div class="placeholder">
                    <p>Select a template to edit, or create a new one.</p>
                </div>
            {/if}
        </main>
    </div>
</Modal>

<style>
    .template-manager-container {
        display: flex;
        gap: 2rem;
        max-height: 70vh;
        min-height: 500px;
    }
    .template-list-panel {
        flex: 0 0 200px;
        border-right: 1px solid var(--color-border-primary);
        padding-right: 2rem;
        display: flex;
        flex-direction: column;
    }
    .template-list {
        list-style: none;
        padding: 0;
        margin: 0 0 1rem 0;
        flex-grow: 1;
        overflow-y: auto;
    }
    .template-item {
        width: 100%;
        background: none;
        border: none;
        color: var(--color-text-link);
        text-align: left;
        padding: 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
    }
    .template-item:hover {
        background-color: var(--color-background-secondary);
    }
    .template-item.active {
        background-color: var(--color-background-tertiary);
        color: var(--color-text-primary);
        font-weight: bold;
    }
    .no-templates-message {
        font-style: italic;
        color: var(--color-text-secondary);
        padding: 1rem 0.5rem;
        flex-grow: 1;
    }
    .template-editor-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .editor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
        flex-shrink: 0;
    }
    .template-name-input {
        flex-grow: 1;
        font-size: 1.2rem;
        font-weight: bold;
        padding: 0.5rem;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-secondary);
        color: var(--color-text-primary);
        border-radius: 4px;
        min-width: 0; /* This is the new fix */
    }
    .editor-actions {
        display: flex;
        gap: 0.5rem;
        flex-shrink: 0;
    }
    .editor-wrapper {
        flex-grow: 1;
        border: 1px solid var(--color-border-primary);
        border-radius: 4px;
        overflow-y: auto;
        position: relative;
    }
    /* Override editor padding to be smaller in this context */
    .editor-wrapper :global(.editor-wrapper) {
        padding: 1em;
    }
    .placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--color-text-secondary);
        font-style: italic;
    }
</style>
