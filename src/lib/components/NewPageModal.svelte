<script lang="ts">
    import { onMount } from "svelte";
    import { getAllDirectoryPaths } from "$lib/commands";
    import { createFile } from "$lib/actions";
    import { closeModal } from "$lib/modalStore";
    import { autofocus } from "$lib/domActions";
    import type { PageHeader } from "$lib/bindings";
    import Modal from "./Modal.svelte";
    import Button from "./Button.svelte";
    import { vaultPath, files } from "$lib/worldStore";
    import { normalizePath, isMarkdown } from "$lib/utils";
    import { SYSTEM_FOLDER_NAME, TEMPLATE_FOLDER_NAME } from "$lib/config";

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
    let allDirs = $state<string[]>([]);
    let pageName = $state(initialName);
    let selectedTemplatePath = $state<string | null>(null); // Use null for "Blank Page"
    let selectedParentDir = $state(normalizePath(parentDir));

    // --- Derived State for Templates ---
    const templates = $derived.by(() => {
        if (!$files || !$files.children) return [];

        // 1. Find the System folder
        const systemFolder = $files.children.find(
            (node) => node.name === SYSTEM_FOLDER_NAME,
        );
        if (!systemFolder || !systemFolder.children) return [];

        // 2. Find the Templates folder inside System
        const templateFolder = systemFolder.children.find(
            (node) => node.name === TEMPLATE_FOLDER_NAME,
        );
        if (!templateFolder || !templateFolder.children) return [];

        // 3. Map the markdown files inside
        return templateFolder.children.filter(isMarkdown).map(
            (node): PageHeader => ({
                title: node.name,
                path: normalizePath(node.path),
            }),
        );
    });

    // --- Lifecycle ---
    onMount(async () => {
        try {
            allDirs = (await getAllDirectoryPaths()).map(normalizePath);
        } catch (e: any) {
            // We can still function if this fails, the dropdown will just be less populated.
            console.error("Failed to load directories:", e);
            // Ensure the current directory is at least in the list.
            if (!allDirs.includes(selectedParentDir)) {
                allDirs = [selectedParentDir, ...allDirs];
            }
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
            <select id="folder-select" bind:value={selectedParentDir}>
                {#each allDirs as dir (dir)}
                    <option value={dir}>{getDisplayDir(dir)}</option>
                {/each}
            </select>
        </div>

        <div class="form-group">
            <label for="template-select">Template</label>
            <select id="template-select" bind:value={selectedTemplatePath}>
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
</style>
