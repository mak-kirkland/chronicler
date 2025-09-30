/**
 * @file This file centralizes user-triggered actions that orchestrate backend commands
 * and frontend state changes. Functions here are the primary bridge between UI components
 * (like buttons and context menus) and the application's core logic, ensuring that
 * operations like file creation or navigation are handled consistently.
 */

import { currentView, fileViewMode } from "./viewStores";
import type { PageHeader } from "./bindings";
// Import all commands under a 'commands' namespace to prevent naming conflicts.
import * as commands from "./commands";
import { getTitleFromPath, isImageFile, isMarkdownFile } from "./utils";
import { world } from "./worldStore";
import NewPageModal from "./components/NewPageModal.svelte";
import TextInputModal from "./components/TextInputModal.svelte";
import { openModal, closeModal } from "./modalStore";
import { dirname } from "@tauri-apps/api/path";
import { get } from "svelte/store";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Navigates the main view to display a specific file.
 * @param page The header of the page to navigate to, containing its path and title.
 */
export function navigateToPage(page: PageHeader) {
    currentView.set({ type: "file", data: page });
}

/**
 * An event handler for clicks within any rendered HTML content. It handles
 * internal wikilinks, external links, spoilers, and unsupported links.
 * This uses event delegation to manage all interactions from a single listener.
 * @param event The MouseEvent or KeyboardEvent from the user.
 */
export function handleContentClick(event: Event) {
    if (
        event instanceof KeyboardEvent &&
        event.key !== "Enter" &&
        event.key !== " "
    ) {
        return;
    }

    const target = event.target as HTMLElement;

    // --- Handle Spoilers ---
    const spoiler = target.closest("span.spoiler");
    if (spoiler) {
        spoiler.classList.toggle("revealed");
    }

    // --- Handle Links ---
    const link = target.closest("a");
    if (link) {
        const href = link.getAttribute("href");

        // A) Handle internal wikilinks
        if (link.classList.contains("internal-link")) {
            event.preventDefault(); // Prevent default for this case
            if (
                link.classList.contains("broken") &&
                link.hasAttribute("data-target")
            ) {
                const targetName = link.getAttribute("data-target")!;
                const currentVaultPath = get(world).vaultPath;
                if (currentVaultPath) {
                    promptAndCreateItem("file", currentVaultPath, targetName);
                }
            } else if (link.hasAttribute("data-path")) {
                const path = link.getAttribute("data-path")!;
                const title = getTitleFromPath(path);
                navigateToPage({ path, title });
            }
            return;
        }

        // B) Handle external links
        if (href && (href.startsWith("http:") || href.startsWith("https:"))) {
            event.preventDefault(); // Prevent default for this case
            openUrl(href);
            return;
        }

        // C) Handle and neutralize any other non-TOC links to prevent 404s
        // We check if the href starts with '#' to allow TOC links to pass through.
        if (href && !href.startsWith("#")) {
            event.preventDefault(); // Prevent default for this case
            console.warn(
                `Blocked navigation for unsupported link href: ${href}`,
            );
        }

        // For any other link (like <a href="#my-header">), we do nothing,
        // allowing the browser's default scroll behavior to work.
    }
}

/**
 * Navigates to the tag index view for a specific tag.
 * @param tagName The name of the tag to display.
 */
export function navigateToTag(tagName: string) {
    currentView.set({ type: "tag", tagName });
}

/**
 * Navigates to a specific report view.
 * @param reportName The identifier for the report to display.
 */
export function navigateToReport(reportName: string) {
    currentView.set({ type: "report", name: reportName });
}

/**
 * Navigates the main view to display an image.
 * @param image The header of the image to open, containing its path and title.
 */
export function navigateToImage(image: PageHeader) {
    currentView.set({ type: "image", data: image });
}

/**
 * Initializes the vault at the given path.
 * This is the main entry point after a user selects a vault folder.
 * @param path The absolute path to the vault directory.
 */
export async function initializeVault(path: string) {
    try {
        await commands.initializeVault(path);
    } catch (e) {
        console.error(`Failed to initialize vault at ${path}:`, e);
        // Re-throw the error so the calling component can handle it
        throw new Error(
            `Could not open vault at "${path}". Please ensure it is a valid directory. Error: ${e}`,
        );
    }
}

/**
 * Creates a new file, refreshes the world state to include it, and navigates
 * the main view to the new file in edit mode.
 * @param parentDir The directory where the new file should be created.
 * @param name The name for the new file.
 * @param templatePath Optional path to a template file to use.
 */
export async function createFile(
    parentDir: string,
    name: string,
    templatePath?: string | null,
) {
    try {
        const newPage = await commands.createNewFile(
            parentDir,
            name,
            templatePath,
        );
        // Manually trigger a refresh to ensure the frontend's file tree is up-to-date.
        await world.initialize();
        // Now that the frontend state is fresh, we can safely navigate to the new file.
        currentView.set({ type: "file", data: newPage });
        fileViewMode.set("split");
        return newPage;
    } catch (e) {
        console.error("Failed to create file:", e);
        alert(`Error: ${e}`);
        throw e;
    }
}

/**
 * Renames a file or folder, refreshes the world state, and conditionally
 * navigates the main view to the new path if the renamed item was open.
 * @param path The current path of the item to rename.
 * @param newName The new name for the item.
 */
export async function renamePath(path: string, newName: string) {
    try {
        // Before the operation, check if the file being renamed is the one currently open.
        const view = get(currentView);
        const wasFileOpen =
            (view.type === "file" || view.type === "image") &&
            view.data &&
            view.data.path === path;

        // Execute the rename command and get the new path from the backend.
        const newPath = await commands.renamePath(path, newName);
        await world.initialize(); // Refresh all data after the operation.

        // If the file was open, navigate the view to its new path.
        if (wasFileOpen) {
            const newTitle = getTitleFromPath(newPath);
            if (isMarkdownFile(newPath)) {
                navigateToPage({ path: newPath, title: newTitle });
            } else if (isImageFile(newPath)) {
                navigateToImage({ path: newPath, title: newTitle });
            }
        }
    } catch (e) {
        console.error(`Rename failed for path: ${path}`, e);
        alert(`Error: ${e}`);
        throw e;
    }
}

/**
 * Deletes a file or folder and then refreshes the world state.
 * @param path The path of the item to delete.
 */
export async function deletePath(path: string) {
    try {
        await commands.deletePath(path);
        await world.initialize(); // Refresh data
    } catch (e) {
        console.error(`Delete failed for path: ${path}`, e);
        alert(`Error: ${e}`);
        throw e;
    }
}

/**
 * Creates a new folder and then refreshes the world state.
 * @param parentDir The directory where the new folder should be created.
 * @param name The name for the new folder.
 */
export async function createFolder(parentDir: string, name: string) {
    try {
        await commands.createNewFolder(parentDir, name);
        await world.initialize(); // Refresh data
    } catch (e) {
        console.error(`Failed to create folder in: ${parentDir}`, e);
        alert(`Error: ${e}`);
        throw e;
    }
}

/**
 * A factory function that opens a modal to prompt the user for a name, then
 * triggers the creation of a new file or folder.
 * @param itemType The type of item to create ('file' or 'folder').
 * @param parentDir The directory in which to create the item.
 * @param initialName An optional pre-filled name for the item.
 */
export function promptAndCreateItem(
    itemType: "file" | "folder",
    parentDir: string,
    initialName?: string,
) {
    if (itemType === "file") {
        // Open the advanced modal for creating pages with templates.
        openModal({
            component: NewPageModal,
            props: {
                parentDir,
                initialName,
                onClose: closeModal,
            },
        });
    } else {
        // For folders, the simple text input is still sufficient.
        openModal({
            component: TextInputModal,
            props: {
                title: "New Folder",
                label: "Enter the name for the new folder:",
                buttonText: "Create",
                onClose: closeModal,
                onSubmit: (name: string) => {
                    createFolder(parentDir, name);
                    closeModal();
                },
            },
        });
    }
}

/**
 * Moves a file or folder, refreshes the world state, and conditionally
 * navigates the main view to the new path if the moved item was open.
 * @param sourcePath The full path of the item to move.
 * @param destinationDir The full path of the target directory.
 */
export async function movePath(sourcePath: string, destinationDir: string) {
    // Get the parent directory of the source file/folder.
    const sourceParentDir = await dirname(sourcePath);

    // If the source is already in the destination directory, or _is_ the destination, do nothing.
    if (sourceParentDir === destinationDir || sourcePath === destinationDir) {
        return;
    }

    try {
        // Before the operation, check if the file being moved is the one currently open.
        const view = get(currentView);
        const wasFileOpen =
            (view.type === "file" || view.type === "image") &&
            view.data &&
            view.data.path === sourcePath;

        // Execute the move command and get the new path.
        const newPath = await commands.movePath(sourcePath, destinationDir);
        await world.initialize(); // Refresh data to show the move in the UI.

        // If the file was open, navigate the view to its new path.
        if (wasFileOpen) {
            const newTitle = getTitleFromPath(newPath);
            if (isMarkdownFile(newPath)) {
                navigateToPage({ path: newPath, title: newTitle });
            } else if (isImageFile(newPath)) {
                navigateToImage({ path: newPath, title: newTitle });
            }
        }
    } catch (e) {
        console.error(
            `Move failed for source '${sourcePath}' to '${destinationDir}'`,
            e,
        );
        alert(`Error: ${e}`);
        throw e;
    }
}

/**
 * Duplicates a page, refreshes the world state, and navigates to the new file.
 * @param path The path of the page to duplicate.
 */
export async function duplicatePage(path: string) {
    try {
        const newPage = await commands.duplicatePage(path);
        await world.initialize(); // Refresh data
        navigateToPage(newPage); // Navigate to the new duplicate
    } catch (e) {
        console.error(`Duplicate failed for path: ${path}`, e);
        alert(`Error: ${e}`);
        throw e;
    }
}
