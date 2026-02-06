<script lang="ts">
    import { onMount, tick } from "svelte";
    import { files, vaultPath, world } from "$lib/worldStore";
    import {
        createNewFile,
        createNewFolder,
        deletePath,
        writePageContent,
    } from "$lib/commands";
    import { navigateToPage } from "$lib/actions";
    import { openModal, closeModal } from "$lib/modalStore";
    import { isMarkdown, normalizePath, findNodeByPath } from "$lib/utils";
    import {
        SYSTEM_FOLDER_NAME,
        TEMPLATE_FOLDER_NAME,
        TEMPLATE_FOLDER_PATH,
        DEFAULT_TEMPLATE_NAME,
    } from "$lib/config";
    import type { PageHeader } from "$lib/bindings";
    import Modal from "$lib/components/modals/Modal.svelte";
    import Button from "$lib/components/ui/Button.svelte";
    import TextInputModal from "$lib/components/modals/TextInputModal.svelte";
    import ConfirmModal from "$lib/components/modals/ConfirmModal.svelte";
    import { fileViewMode } from "$lib/viewStores";

    let { onClose } = $props<{
        onClose: () => void;
    }>();

    // --- Constants ---
    const DEFAULT_TEMPLATE_CONTENT =
        '---\ntags: []\n---\n\n';

    // --- Derived State ---
    const fullTemplatePath = $derived(
        $vaultPath
            ? normalizePath(`${$vaultPath}/${TEMPLATE_FOLDER_PATH}`)
            : null,
    );

    const templateFolderNode = $derived(
        fullTemplatePath ? findNodeByPath($files, fullTemplatePath) : undefined,
    );

    const activeTemplateFolderPath = $derived(
        templateFolderNode
            ? normalizePath(templateFolderNode.path)
            : fullTemplatePath,
    );

    const templateFiles = $derived(
        templateFolderNode?.children?.filter(isMarkdown).map(
            (node): PageHeader => ({
                title: node.name,
                path: normalizePath(node.path),
            }),
        ) ?? [],
    );

    // --- Lifecycle ---
    onMount(async () => {
        // Wait for Svelte to register the derived stores
        await tick();
        if (!templateFolderNode && $vaultPath) {
            handleCreateTemplateFolder();
        }
    });

    // --- Actions ---

    /**
     * Creates the `_system/templates` folder structure.
     */
    async function handleCreateTemplateFolder() {
        if (!$vaultPath) return;

        try {
            // 1. Ensure parent _system folder exists
            const systemPath = `${$vaultPath}/${SYSTEM_FOLDER_NAME}`;
            try {
                await createNewFolder($vaultPath, SYSTEM_FOLDER_NAME);
            } catch (e) {
                // Ignore if exists
            }

            // 2. Ensure nested templates folder exists
            await createNewFolder(systemPath, TEMPLATE_FOLDER_NAME);

            await world.initialize(); // Refresh the file tree
        } catch (e: any) {
            if (!e.toString().includes("exists")) {
                alert(`Failed to create folder structure: ${e}`);
            } else {
                await world.initialize();
            }
        }
    }

    /**
     * This function contains all the logic for creating a new template.
     * It's called by `promptForNewTemplate` after the user submits a name.
     */
    async function handleCreateNewTemplate(name: string) {
        if (!activeTemplateFolderPath) return;

        let newTemplate: PageHeader | null = null;
        try {
            // Call createNewFile with null template path
            newTemplate = await createNewFile(
                activeTemplateFolderPath,
                name,
                null, // Create a default "blank" page first
            );

            // Immediately overwrite it with the desired template content
            await writePageContent(newTemplate.path, DEFAULT_TEMPLATE_CONTENT);

            // We call initialize() to force an immediate refresh of the file list
            // in the modal, rather than waiting for the file watcher.
            await world.initialize();

            // Navigate to the new template *after* everything is done
            fileViewMode.set("split");
            navigateToPage(newTemplate);
        } catch (e: any) {
            alert(`Failed to create template: ${e}`);
            if (newTemplate) {
                await deletePath(newTemplate.path);
            }
        }
    }

    /**
     * Opens a modal to prompt for a new template name, then creates it.
     */
    function promptForNewTemplate() {
        if (!activeTemplateFolderPath) return;

        openModal({
            component: TextInputModal,
            props: {
                title: "New Template",
                label: "Enter the name for the new template:",
                buttonText: "Create",
                onClose: closeModal,
                onSubmit: (name: string) => {
                    closeModal();
                    handleCreateNewTemplate(name);
                },
            },
        });
    }

    /**
     * Navigates to the main editor to edit the selected template.
     */
    function handleEdit(template: PageHeader) {
        fileViewMode.set("split");
        navigateToPage(template);
        onClose();
    }

    /**
     * Opens a modal to confirm deletion, then deletes the template.
     */
    function handleDelete(template: PageHeader) {
        openModal({
            component: ConfirmModal,
            props: {
                title: "Delete Template",
                message: `Are you sure you want to delete "${template.title}"?`,
                onClose: closeModal,
                onConfirm: async () => {
                    closeModal();
                    try {
                        await deletePath(template.path);
                    } catch (e: any) {
                        alert(`Failed to delete template: ${e}`);
                    }
                },
            },
        });
    }
</script>

<Modal title="Template Manager" {onClose}>
    <div class="template-manager-container">
        {#if templateFolderNode}
            <p class="description">
                Manage templates from your vault's
                <code>{TEMPLATE_FOLDER_PATH}</code> folder.
            </p>
            <p class="description-tip">
                <strong>Tip:</strong> Create a template named
                <code>{DEFAULT_TEMPLATE_NAME}</code>
                to override the default blank page format.
            </p>
            <ul class="template-list">
                {#each templateFiles as template (template.path)}
                    <li class="template-item">
                        <span class="template-name">{template.title}</span>
                        <div class="template-actions">
                            <Button
                                size="small"
                                onclick={() => handleEdit(template)}
                                >Edit</Button
                            >
                            <Button
                                size="small"
                                onclick={() => handleDelete(template)}
                                >Delete</Button
                            >
                        </div>
                    </li>
                {/each}
            </ul>
            {#if templateFiles.length === 0}
                <p class="no-templates-message">
                    No templates found in your
                    <code>{TEMPLATE_FOLDER_PATH}</code> folder.
                </p>
            {/if}
            <Button onclick={promptForNewTemplate}>+ New Template</Button>
        {:else}
            <p>
                The <code>{TEMPLATE_FOLDER_PATH}</code> folder structure could not
                be found or is being created.
            </p>
            <Button onclick={handleCreateTemplateFolder}
                >Create Folder Structure</Button
            >
        {/if}
    </div>
</Modal>

<style>
    .template-manager-container {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-height: 400px;
        max-height: 70vh;
    }
    .description {
        font-size: 0.95rem;
        color: var(--color-text-secondary);
        margin: 0;
    }
    .description-tip {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        background-color: var(--color-background-secondary);
        padding: 0.5rem;
        border-radius: 4px;
        margin: 0;
        border-left: 3px solid var(--color-accent-primary);
    }
    .template-list {
        list-style: none;
        padding: 0;
        margin: 0;
        flex-grow: 1;
        overflow-y: auto;
        border: 1px solid var(--color-border-primary);
        border-radius: 6px;
        background-color: var(--color-background-secondary);
    }
    .template-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .template-item:last-child {
        border-bottom: none;
    }
    .template-name {
        font-size: 1rem;
        font-weight: 500;
    }
    .template-actions {
        display: flex;
        gap: 0.5rem;
    }
    .no-templates-message {
        font-style: italic;
        color: var(--color-text-secondary);
        padding: 2rem;
        text-align: center;
        flex-grow: 1;
    }
</style>
