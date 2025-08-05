/**
 * @file This file centralizes user-triggered actions that orchestrate backend commands
 * and frontend state changes. Functions here are the primary bridge between UI components
 * (like buttons and context menus) and the application's core logic, ensuring that
 * operations like file creation or navigation are handled consistently.
 */

import { currentView, fileViewMode } from "./viewStores";
import { appStatus } from "./appState.ts";
import type { PageHeader } from "./bindings";
// Import all commands under a 'commands' namespace to prevent naming conflicts.
import * as commands from "./commands";
import { getTitleFromPath } from "./utils";
import { world } from "./worldStore";
import TextInputModal from "./components/TextInputModal.svelte";
import { openModal, closeModal } from "./modalStore";

/**
 * Navigates the main view to display a specific file.
 * @param page The header of the page to navigate to, containing its path and title.
 */
export function navigateToPage(page: PageHeader) {
    currentView.set({ type: "file", data: page });
}

/**
 * An event handler for clicks within rendered HTML content. It specifically
 * looks for clicks on internal wikilinks and triggers navigation.
 * This allows the static HTML from the backend to become interactive.
 * @param event The MouseEvent or KeyboardEvent from the user.
 */
export function handleLinkClick(event: Event) {
    if (
        event instanceof KeyboardEvent &&
        event.key !== "Enter" &&
        event.key !== " "
    ) {
        return;
    }

    const target = event.target as HTMLElement;
    const link = target.closest("a.internal-link");

    if (link && link.hasAttribute("data-path")) {
        event.preventDefault();
        const path = link.getAttribute("data-path")!;
        const title = link.textContent || getTitleFromPath(path);
        navigateToPage({ path, title });
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
 */
export async function createFile(parentDir: string, name: string) {
    try {
        const newPage = await commands.createNewFile(parentDir, name);
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
 * Renames a file or folder and then refreshes the world state to reflect the change.
 * @param path The current path of the item to rename.
 * @param newName The new name for the item.
 */
export async function renamePath(path: string, newName: string) {
    try {
        await commands.renamePath(path, newName);
        await world.initialize(); // Refresh data
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
 */
export function promptAndCreateItem(
    itemType: "file" | "folder",
    parentDir: string,
) {
    const isFile = itemType === "file";

    openModal({
        component: TextInputModal,
        props: {
            title: `New ${isFile ? "Page" : "Folder"}`,
            label: `Enter the name for the new ${isFile ? "page" : "folder"}:`,
            buttonText: "Create",
            onClose: closeModal,
            onSubmit: (name: string) => {
                if (isFile) {
                    createFile(parentDir, name);
                } else {
                    createFolder(parentDir, name);
                }
                closeModal();
            },
        },
    });
}

/**
 * Moves a file or folder to a new directory.
 * @param sourcePath The full path of the item to move.
 * @param destinationDir The full path of the target directory.
 */
export async function movePath(sourcePath: string, destinationDir: string) {
    // The backend will handle checking if the source and destination are effectively the same.
    try {
        await commands.movePath(sourcePath, destinationDir);
        await world.initialize(); // Refresh data to show the move in the UI.
    } catch (e) {
        console.error(
            `Move failed for source '${sourcePath}' to '${destinationDir}'`,
            e,
        );
        alert(`Error: ${e}`);
        throw e;
    }
}
