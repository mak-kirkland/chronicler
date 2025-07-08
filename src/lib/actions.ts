import { currentView, appStatus, fileViewMode } from "$lib/stores";
import type { PageHeader } from "$lib/bindings";
// Import all commands under a 'commands' namespace to prevent naming conflicts.
import * as commands from "./commands";
import { getTitleFromPath } from "./utils";
import { world } from "./worldStore";
import TextInputModal from "./components/TextInputModal.svelte";
import { openModal, closeModal } from "./modalStore";

/**
 * Navigates to a specific file page.
 * @param page The header of the page to navigate to.
 */
export function navigateToPage(page: PageHeader) {
    currentView.set({ type: "file", data: page });
}

/**
 * An event handler to be used on rendered HTML content. It looks for clicks
 * on internal wikilinks and navigates to the appropriate page.
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
 * Navigates to the tag index view for the selected tag.
 *
 * @param tagName The name of the tag to navigate to.
 */
export function navigateToTag(tagName: string) {
    currentView.set({ type: "tag", tagName });
}

/**
 * Initializes the vault at the given path.
 */
export async function initializeVault(path: string) {
    appStatus.set("loading");
    try {
        await commands.initializeVault(path);
        appStatus.set("ready");
    } catch (e) {
        console.error(`Failed to initialize vault at ${path}:`, e);
        // Re-throw the error so the calling component can handle it (e.g., display a message)
        throw new Error(
            `Could not open vault at "${path}". Please ensure it is a valid directory. Error: ${e}`,
        );
    }
}

/**
 * Creates a new file, refreshes the world state, then navigates the main view to that file.
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
 * Renames a file or folder and then refreshes the world state.
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
 * Opens a modal to prompt the user for a name, then creates a new file or folder.
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
