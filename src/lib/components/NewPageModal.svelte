<script lang="ts">
    import { onMount } from "svelte";
    import { listTemplates, getAllDirectoryPaths } from "$lib/commands";
    import { createFile } from "$lib/actions";
    import { closeModal } from "$lib/modalStore";
    import { autofocus } from "$lib/domActions";
    import type { PageHeader } from "$lib/bindings";
    import Modal from "./Modal.svelte";
    import Button from "./Button.svelte";
    import { vaultPath } from "$lib/worldStore";
    import { normalizePath } from "$lib/utils";

    let {
        parentDir,
        onClose,
        initialName = "",
    } = $props<{
        parentDir: string;
        onClose: () => void;
        initialName?: string;
    }>();

    // --- State ---
    let templates = $state<PageHeader[]>([]);
    let allDirs = $state<string[]>([]);
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let pageName = $state(initialName);
    let selectedTemplatePath = $state<string | null>(null); // Use null for "Blank Page"
    let selectedParentDir = $state(normalizePath(parentDir));

    // --- Lifecycle ---
    onMount(async () => {
        try {
            const [templateList, dirList] = await Promise.all([
                listTemplates(),
                getAllDirectoryPaths(),
            ]);

            templates = templateList;
            allDirs = dirList.map(normalizePath);
        } catch (e: any) {
            error = `Failed to load data: ${e.message}`;
        } finally {
            isLoading = false;
        }
    });

    // --- Actions ---
    function handleSubmit(event: SubmitEvent) {
        event.preventDefault();
        if (!pageName.trim()) {
            alert("Page name cannot be empty.");
            return;
        }

        createFile(selectedParentDir, pageName.trim(), selectedTemplatePath);
        closeModal();
    }

    /** Helper to create a user-friendly display name from a full path */
    function getDisplayDir(fullPath: string): string {
        const rootPath = $vaultPath ? normalizePath($vaultPath) : "";
        if (fullPath === rootPath) {
            return "/ (Vault Root)";
        }
        // Remove the root path and the leading slash for a cleaner display
        return fullPath.replace(rootPath, "").replace(/^\//, "");
    }
</script>

<Modal title="Create New Page" {onClose}>
    <form onsubmit={handleSubmit} class="form">
        <div class="form-group">
            <label for="page-name">Page Name</label>
            <input
                id="page-name"
                type="text"
                bind:value={pageName}
                use:autofocus
                placeholder="Name of your new page"
            />
        </div>

        <div class="form-group">
            <label for="folder-select">Folder</label>
            <select
                id="folder-select"
                bind:value={selectedParentDir}
                disabled={isLoading}
            >
                {#each allDirs as dir (dir)}
                    <option value={dir}>{getDisplayDir(dir)}</option>
                {/each}
            </select>
        </div>

        <div class="form-group">
            <label for="template-select">Template</label>
            <select
                id="template-select"
                bind:value={selectedTemplatePath}
                disabled={isLoading}
            >
                <option value={null}>Blank Page (Default)</option>
                {#if templates.length > 0}
                    <optgroup label="Your Templates">
                        {#each templates as template (template.path)}
                            <option value={template.path}
                                >{template.title}</option
                            >
                        {/each}
                    </optgroup>
                {/if}
            </select>
            {#if error}
                <p class="error-text">{error}</p>
            {/if}
        </div>

        <div class="modal-actions">
            <Button type="button" variant="ghost" onclick={onClose}
                >Cancel</Button
            >
            <Button type="submit">Create Page</Button>
        </div>
    </form>
</Modal>

<style>
    .form {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    label {
        font-weight: bold;
        color: var(--color-text-secondary);
    }
    input,
    select {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 1rem;
        box-sizing: border-box;
    }
    input:focus,
    select:focus {
        outline: 1px solid var(--color-accent-primary);
        border-color: var(--color-accent-primary);
    }
    select {
        appearance: none;
        background-image: var(--select-arrow);
        background-repeat: no-repeat;
        background-position: right 0.75rem center;
        background-size: 1.2em;
        padding-right: 2.5rem;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
    }
    .error-text {
        font-size: 0.9rem;
        color: var(--color-text-error);
        margin: 0.25rem 0 0 0;
    }
</style>
