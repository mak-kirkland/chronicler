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
    import { log } from "$lib/logger";
    import Button from "$lib/components/ui/Button.svelte";
    import Modal from "$lib/components/modals/Modal.svelte";
    import { t } from "$lib/i18n";

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
                log.error(
                    "Failed to check pandoc status",
                    err,
                    "ImporterModal",
                );
                pandocInstalled = false;
            });
    });

    /**
     * Downloads and installs Pandoc if the user confirms.
     */
    async function installPandoc() {
        if (!window.confirm($t("importer.pandocConfirm"))) {
            return;
        }

        isProcessing = true;
        importMessage = $t("importer.pandocDownloading");
        try {
            await downloadPandoc();
            pandocInstalled = true;
            importMessage = $t("importer.pandocInstalled");
        } catch (e) {
            log.error("Pandoc installation failed", e, "ImporterModal");
            importMessage = $t("importer.pandocFailed", { error: String(e) });
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
            importMessage = $t("importer.preparing", { count: paths.length });
        } else {
            importMessage = $t("importer.scanningFolder");
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
                alert($t("importer.noDocxFound"));
                importMessage = null;
                return;
            }

            // After a successful import, refresh the world state to show the new files.
            await world.initialize();
            alert(
                $t("importer.filesImported", { count: importedPaths.length }),
            );
            onClose(); // Close the modal on success
        } catch (e) {
            log.error("Import failed", e, "ImporterModal");
            alert($t("importer.failed", { error: String(e) }));
            importMessage = $t("importer.failed", { error: String(e) });
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
            log.error("DOCX file selection failed", e, "ImporterModal");
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
                title: $t("importer.selectFolderTitle"),
            });
            if (typeof selected === "string") {
                await handleDocxImport(selected);
            }
        } catch (e) {
            log.error("Folder selection failed", e, "ImporterModal");
        }
    }

    /**
     * Handles the import process for a MediaWiki XML dump.
     * @param path The file path of the selected XML file.
     */
    async function handleMediawikiImport(path: string) {
        isProcessing = true;
        importMessage = $t("importer.processingMediawiki");

        await new Promise((resolve) => setTimeout(resolve, 100));

        try {
            const importedPaths = await importMediawikiDump(path);
            if (importedPaths.length === 0) {
                alert($t("importer.noPagesFound"));
                importMessage = null;
                return;
            }

            await world.initialize();
            alert(
                $t("importer.pagesImported", { count: importedPaths.length }),
            );
            onClose();
        } catch (e) {
            log.error("MediaWiki import failed", e, "ImporterModal");
            alert($t("importer.mediawikiFailed", { error: String(e) }));
            importMessage = $t("importer.mediawikiFailed", {
                error: String(e),
            });
        } finally {
            isProcessing = false;
        }
    }

    /**
     * Opens the file dialog to select a MediaWiki XML file.
     */
    async function selectMediawikiDump() {
        if (!pandocInstalled) {
            await installPandoc();
            return; // User can click again after installation is complete.
        }
        try {
            const selected = await open({
                multiple: false,
                filters: [{ name: "MediaWiki XML Dump", extensions: ["xml"] }],
            });
            if (typeof selected === "string") {
                await handleMediawikiImport(selected);
            }
        } catch (e) {
            log.error("MediaWiki file selection failed", e, "ImporterModal");
        }
    }
</script>

<Modal title={$t("importer.title")} {onClose}>
    <div class="modal-body-content">
        <div class="setting-item">
            <h4>{$t("importer.mediawikiTitle")}</h4>
            <p>
                {$t("importer.mediawikiDescription")}
            </p>
            {#if !pandocInstalled}
                <p class="pandoc-warning">
                    {$t("importer.pandocRequired")}
                </p>
            {/if}
            <div class="button-group">
                <Button onclick={selectMediawikiDump} disabled={isProcessing}>
                    {#if isProcessing && !pandocInstalled}
                        {$t("importer.installingPandoc")}
                    {:else if isProcessing}
                        {$t("importer.importing")}
                    {:else}
                        {$t("importer.selectXml")}
                    {/if}
                </Button>
            </div>
        </div>

        <div class="setting-item">
            <h4>{$t("importer.docxTitle")}</h4>
            <p>
                {$t("importer.docxDescription")}
            </p>
            {#if !pandocInstalled}
                <p class="pandoc-warning">
                    {$t("importer.pandocRequired")}
                </p>
            {/if}

            <div class="button-group">
                <Button onclick={selectDocxFiles} disabled={isProcessing}>
                    {#if isProcessing && !pandocInstalled}
                        {$t("importer.installingPandoc")}
                    {:else if isProcessing}
                        {$t("importer.importing")}
                    {:else}
                        {$t("importer.selectFiles")}
                    {/if}
                </Button>

                <Button onclick={selectDocxFolder} disabled={isProcessing}>
                    {#if isProcessing && !pandocInstalled}
                        {$t("importer.installingPandoc")}
                    {:else if isProcessing}
                        {$t("importer.importing")}
                    {:else}
                        {$t("importer.selectFolder")}
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
