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
import {
    manuallyExpandedPaths,
    showImages,
    showExternalFiles,
} from "$lib/explorerStore";
import { hasMapsEntitlement, hasTimelinesEntitlement } from "$lib/licenseStore";
import { translate } from "$lib/i18n";

// Import modal components that can be triggered from the context menu
import TextInputModal from "./components/modals/TextInputModal.svelte";
import ConfirmModal from "./components/modals/ConfirmModal.svelte";
import NewMapModal from "./components/map/NewMapModal.svelte";
import NewCanvasModal from "./components/modals/NewCanvasModal.svelte";
import NewTimelineModal from "./components/timeline/NewTimelineModal.svelte";

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
                label: translate("contextMenu.rename"),
                handler: () => {
                    openModal({
                        component: TextInputModal,
                        props: {
                            title: isDir
                                ? translate("contextMenu.renameFolder")
                                : translate("contextMenu.renameFile"),
                            label: translate("contextMenu.enterNewName"),
                            // For files, we pre-fill the name without the extension for convenience.
                            initialValue: isDir
                                ? node.name
                                : fileStemString(node.path),
                            buttonText: translate("contextMenu.rename"),
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
                label: translate("common.delete"),
                handler: () => {
                    openModal({
                        component: ConfirmModal,
                        props: {
                            title: isDir
                                ? translate("contextMenu.deleteFolder")
                                : translate("contextMenu.deleteFile"),
                            message: translate("contextMenu.deleteConfirm", {
                                name: node.name,
                            }),
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
            label: translate("contextMenu.duplicate"),
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
            label: translate("contextMenu.newPage"),
            handler: () => promptAndCreateItem("file", node.path),
        });

        actions.push({
            label: translate("contextMenu.newCanvas"),
            handler: () => {
                openModal({
                    component: NewCanvasModal,
                    props: { parentDir: node.path, onClose: closeModal },
                });
            },
        });

        // Only show if the user has the maps entitlement
        if (get(hasMapsEntitlement)) {
            actions.push({
                label: translate("contextMenu.newMap"),
                handler: () => {
                    openModal({
                        component: NewMapModal,
                        props: {
                            onClose: closeModal,
                        },
                    });
                },
            });
        }

        // Only show if the user has the timelines entitlement
        if (get(hasTimelinesEntitlement)) {
            actions.push({
                label: translate("contextMenu.newTimeline"),
                handler: () => {
                    openModal({
                        component: NewTimelineModal,
                        props: { parentDir: node.path, onClose: closeModal },
                    });
                },
            });
        }

        actions.push({
            label: translate("contextMenu.newFolder"),
            handler: () => promptAndCreateItem("folder", node.path),
        });
        actions.push({ isSeparator: true });
        actions.push({
            label: translate("contextMenu.openInExplorer"),
            handler: () => openInExplorer(node.path),
        });
    }

    // 4. GLOBAL SETTINGS (Applied to entire Explorer)
    actions.push({ isSeparator: true });

    actions.push({
        label: translate("contextMenu.collapseAll"),
        handler: () => manuallyExpandedPaths.collapseAll(),
    });

    actions.push({
        label: translate("contextMenu.showImages"),
        checked: get(showImages),
        handler: () => showImages.update((v) => !v),
    });

    actions.push({
        label: translate("contextMenu.showExternalFiles"),
        checked: get(showExternalFiles),
        handler: () => showExternalFiles.update((v) => !v),
    });

    return actions;
}
