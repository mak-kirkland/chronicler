<script lang="ts">
    import { onMount } from "svelte";
    import { getAllDirectoryPaths } from "$lib/commands";
    import { createFile } from "$lib/actions";
    import { closeModal } from "$lib/modalStore";
    import { autofocus } from "$lib/domActions";
    import type { PageHeader } from "$lib/bindings";
    import Modal from "./Modal.svelte";
    import Button from "./Button.svelte";
    import SearchableSelect from "./SearchableSelect.svelte";
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
    // We use an empty string to represent "Blank Page" for the Select component
    let selectedTemplatePath = $state<string>("");
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

    // Create a simple array of paths for the SearchableSelect
    // The first option "" represents the default blank page
    const templateOptions = $derived(["", ...templates.map((t) => t.path)]);

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

        // Convert empty string back to null for the backend action
        const templateToUse =
            selectedTemplatePath === "" ? null : selectedTemplatePath;

        createFile(selectedParentDir, pageName.trim(), templateToUse);
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

    /** Helper to display template names based on their path */
    function getTemplateDisplay(path: string): string {
        if (path === "") return "Blank Page (Default)";
        const t = templates.find((item) => item.path === path);
        return t ? t.title : path;
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
            <SearchableSelect
                options={allDirs}
                bind:value={selectedParentDir}
                formatLabel={getDisplayDir}
                placeholder="Search folders..."
            />
        </div>

        <div class="form-group">
            <label for="template-select">Template</label>
            <SearchableSelect
                options={templateOptions}
                bind:value={selectedTemplatePath}
                formatLabel={getTemplateDisplay}
                placeholder="Search templates..."
            />
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
    input {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--color-border-primary);
        background-color: var(--color-background-primary);
        color: var(--color-text-primary);
        font-size: 1rem;
        box-sizing: border-box;
    }
    input:focus {
        outline: 1px solid var(--color-accent-primary);
        border-color: var(--color-accent-primary);
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
    }
</style>
