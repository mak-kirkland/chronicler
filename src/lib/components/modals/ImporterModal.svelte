<script lang="ts">
    import { open } from "@tauri-apps/plugin-dialog";
    import {
        downloadPandoc,
        importDocxFiles,
        importDocxFromFolder,
        importMediawikiDump,
        isPandocInstalled,
    } from "$lib/commands";
    import { world } from "$lib/worldStore";
    import Button from "$lib/components/ui/Button.svelte";
    import Modal from "$lib/components/modals/Modal.svelte";

    // The `onClose` function is passed as a prop to allow this modal to be closed from its parent.
    let { onClose = () => {} } = $props<{ onClose?: () => void }>();

    // --- Component State ---
    let pandocInstalled = $state(false);
    let isProcessing = $state(false); // A general flag for any long-running task (installing, importing)
    let importMessage = $state<string | null>(null); // Feedback message for the user

    // On component mount, check if Pandoc is already installed.
    $effect(() => {
        isPandocInstalled()
            .then((installed) => {
                pandocInstalled = installed;
            })
            .catch((err) => {
                console.error("Failed to check pandoc status:", err);
                pandocInstalled = false;
            });
    });

    /**
     * Downloads and installs Pandoc if the user confirms.
     */
    async function installPandoc() {
        if (
            !window.confirm(
                "This feature requires Pandoc, a universal document converter. Allow Chronicler to download it? (This is a one-time download of approx. 200MB).",
            )
        ) {
            return;
        }

        isProcessing = true;
        importMessage = "Downloading and setting up Pandoc...";
        try {
            await downloadPandoc();
            pandocInstalled = true;
            importMessage =
                "Pandoc installed successfully! You can now import files.";
        } catch (e) {
            console.error("Pandoc installation failed:", e);
            importMessage = `Failed to install Pandoc: ${e}`;
        } finally {
            isProcessing = false;
        }
    }

    /**
     * A generic handler that calls the correct backend command for either
     * a list of files or a single folder path.
     * @param paths - Either an array of file paths or a single folder path string.
     */
    async function handleDocxImport(paths: string[] | string) {
        // 1. Set the initial state and message so the user sees immediate feedback.
        isProcessing = true;
        if (Array.isArray(paths)) {
            importMessage = `Preparing to import ${paths.length} file(s)...`;
        } else {
            importMessage = `Scanning folder...`;
        }

        // 2. Wait for the next "tick" of the JavaScript event loop.
        // This gives Svelte a chance to re-render the UI with the message above
        // before we start the long-running, blocking backend command.
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 3. Now that the UI has been updated, we can run the heavy task.
        try {
            let importedPaths: string[] = [];
            if (Array.isArray(paths)) {
                importedPaths = await importDocxFiles(paths);
            } else {
                importedPaths = await importDocxFromFolder(paths);
            }

            if (importedPaths.length === 0) {
                alert("No .docx files were found to import.");
                importMessage = null;
                return;
            }

            // After a successful import, refresh the world state to show the new files.
            await world.initialize();
            alert(`${importedPaths.length} file(s) imported successfully!`);
            onClose(); // Close the modal on success
        } catch (e) {
            console.error("Import failed:", e);
            alert(`Import failed: ${e}`);
            importMessage = `Import failed: ${e}`;
        } finally {
            isProcessing = false;
        }
    }

    /**
     * Opens the file dialog for selecting individual .docx files.
     */
    async function selectDocxFiles() {
        if (!pandocInstalled) {
            await installPandoc();
            return; // User can click again after installation is complete.
        }
        try {
            const selected = await open({
                multiple: true,
                filters: [{ name: "Word Document", extensions: ["docx"] }],
            });
            if (Array.isArray(selected) && selected.length > 0) {
                await handleDocxImport(selected);
            }
        } catch (e) {
            console.error("File selection failed:", e);
        }
    }

    /**
     * Opens the directory dialog for selecting a folder.
     */
    async function selectDocxFolder() {
        if (!pandocInstalled) {
            await installPandoc();
            return; // User can click again after installation is complete.
        }
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: "Select a folder to import .docx files from",
            });
            if (typeof selected === "string") {
                await handleDocxImport(selected);
            }
        } catch (e) {
            console.error("Folder selection failed:", e);
        }
    }

    /**
     * Handles the import process for a MediaWiki XML dump.
     * @param path The file path of the selected XML file.
     */
    async function handleMediawikiImport(path: string) {
        isProcessing = true;
        importMessage = "Processing MediaWiki XML dump...";

        await new Promise((resolve) => setTimeout(resolve, 100));

        try {
            const importedPaths = await importMediawikiDump(path);
            if (importedPaths.length === 0) {
                alert("No pages were found to import from the XML file.");
                importMessage = null;
                return;
            }

            await world.initialize();
            alert(`${importedPaths.length} page(s) imported successfully!`);
            onClose();
        } catch (e) {
            console.error("MediaWiki import failed:", e);
            alert(`MediaWiki import failed: ${e}`);
            importMessage = `MediaWiki import failed: ${e}`;
        } finally {
            isProcessing = false;
        }
    }

    /**
     * Opens the file dialog to select a MediaWiki XML file.
     */
    async function selectMediawikiDump() {
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: "MediaWiki XML Dump", extensions: ["xml"] }],
            });
            if (typeof selected === "string") {
                await handleMediawikiImport(selected);
            }
        } catch (e) {
            console.error("File selection failed:", e);
        }
    }
</script>

<Modal title="Import Documents" {onClose}>
    <div class="modal-body-content">
        <div class="setting-item">
            <h4>Import from MediaWiki</h4>
            <p>
                Import a MediaWiki XML dump file. This will convert pages,
                download images, and create tag indexes.
            </p>
            <div class="button-group">
                <Button onclick={selectMediawikiDump} disabled={isProcessing}>
                    {#if isProcessing}
                        Importing...
                    {:else}
                        Select XML File
                    {/if}
                </Button>
            </div>
        </div>

        <div class="setting-item">
            <h4>Import from .docx</h4>
            <p>
                Import .docx files as new Markdown pages in your vault's root
                directory.
            </p>
            {#if !pandocInstalled}
                <p class="pandoc-warning">
                    This feature requires <strong>Pandoc</strong>. Click a
                    button below to download and install it automatically.
                </p>
            {/if}

            <div class="button-group">
                <Button onclick={selectDocxFiles} disabled={isProcessing}>
                    {#if isProcessing && !pandocInstalled}
                        Installing Pandoc...
                    {:else if isProcessing}
                        Importing...
                    {:else}
                        Select Files
                    {/if}
                </Button>

                <Button onclick={selectDocxFolder} disabled={isProcessing}>
                    {#if isProcessing && !pandocInstalled}
                        Installing Pandoc...
                    {:else if isProcessing}
                        Importing...
                    {:else}
                        Select Folder
                    {/if}
                </Button>
            </div>
        </div>

        {#if importMessage}
            <p class="import-message">{importMessage}</p>
        {/if}
    </div>
</Modal>

<style>
    .modal-body-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .setting-item {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--color-border-primary);
    }
    .setting-item:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }
    h4 {
        margin: 0;
    }
    .setting-item p {
        margin: 0;
        font-size: 0.95rem;
    }
    .button-group {
        display: flex;
        gap: 0.5rem;
        margin-top: 1rem;
    }
    .pandoc-warning {
        font-style: italic;
        font-size: 0.9rem !important;
        color: var(--color-text-secondary);
    }
    .import-message {
        font-size: 0.9rem;
        font-style: italic;
        color: var(--color-text-secondary);
        margin-top: 1.5rem !important;
        text-align: center;
    }
</style>
