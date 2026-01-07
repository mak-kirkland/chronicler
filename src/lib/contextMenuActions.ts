/**
 * @file This module is responsible for dynamically generating the list of actions
 * that appear in the right-click context menu for files and folders in the sidebar.
 * It encapsulates the logic for which actions are available for which node types
 * and what happens when they are clicked (e.g., opening a modal).
 */

import type { FileNode } from "$lib/bindings";
import type { ContextMenuItem } from "$lib/types";
import { get } from "svelte/store";
import { openModal, closeModal } from "$lib/modalStore";
import {
    renamePath,
    deletePath,
    promptAndCreateItem,
    duplicatePage,
} from "$lib/actions";
import { isDirectory, isMarkdown, fileStemString } from "$lib/utils";
import { openInExplorer } from "$lib/commands";
import { manuallyExpandedPaths, showImages } from "$lib/explorerStore";
// Import modal components that can be triggered from the context menu
import TextInputModal from "./components/TextInputModal.svelte";
import ConfirmModal from "./components/ConfirmModal.svelte";

/**
 * This function dynamically builds the list of actions for the context menu
 * based on the node that was clicked (file vs. folder).
 *
 * @param node The FileNode that was right-clicked.
 * @param vaultPath The path of the vault's root, to identify the root node.
 * @returns An array of ContextMenuItem objects for the menu.
 */
export function getContextMenuActions(
    node: FileNode,
    vaultPath: string | null,
): ContextMenuItem[] {
    const isDir = isDirectory(node);
    // A node is the root if its path matches the vault's root path.
    const isRoot = vaultPath ? node.path === vaultPath : false;

    const actions: ContextMenuItem[] = [];

    // 1. STANDARD ITEM ACTIONS
    // We don't allow renaming or deleting the root vault folder from within the app.
    if (!isRoot) {
        actions.push(
            {
                label: "Rename",
                handler: () => {
                    openModal({
                        component: TextInputModal,
                        props: {
                            title: `Rename ${isDir ? "Folder" : "File"}`,
                            label: "Enter new name:",
                            // For files, we pre-fill the name without the extension for convenience.
                            initialValue: isDir
                                ? node.name
                                : fileStemString(node.path),
                            buttonText: "Rename",
                            onClose: closeModal,
                            onSubmit: (newName: string) => {
                                renamePath(node.path, newName);
                                closeModal();
                            },
                        },
                    });
                },
            },
            {
                label: "Delete",
                handler: () => {
                    openModal({
                        component: ConfirmModal,
                        props: {
                            title: `Delete ${isDir ? "Folder" : "File"}`,
                            message: `Are you sure you want to delete '${node.name}'? This action cannot be undone.`,
                            onClose: closeModal,
                            onConfirm: () => {
                                deletePath(node.path);
                                closeModal();
                            },
                        },
                    });
                },
            },
        );
    }

    // 2. FILE-SPECIFIC ACTIONS
    // Add "Duplicate" action only for Markdown files.
    if (isMarkdown(node)) {
        actions.push({
            label: "Duplicate",
            handler: () => duplicatePage(node.path),
        });
    }

    // 3. FOLDER-SPECIFIC ACTIONS
    if (isDir) {
        // If we have added any actions above (Rename, Delete, Duplicate),
        // add a separator before the creation actions.
        if (actions.length > 0) {
            actions.push({ isSeparator: true });
        }

        actions.push({
            label: "New Page...",
            handler: () => promptAndCreateItem("file", node.path),
        });
        actions.push({
            label: "New Folder...",
            handler: () => promptAndCreateItem("folder", node.path),
        });
        actions.push({ isSeparator: true });
        actions.push({
            label: "Open in Explorer",
            handler: () => openInExplorer(node.path),
        });
    }

    // 4. GLOBAL SETTINGS (Applied to entire Explorer)
    actions.push({ isSeparator: true });

    actions.push({
        label: "Collapse All Folders",
        handler: () => manuallyExpandedPaths.collapseAll(),
    });

    const imagesVisible = get(showImages);
    actions.push({
        label: imagesVisible ? "Hide Images" : "Show Images",
        handler: () => showImages.update((v) => !v),
    });

    return actions;
}
