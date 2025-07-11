/**
 * @file This file serves as the API bridge between the Svelte frontend and the Rust backend.
 * It provides strongly-typed wrappers around Tauri's `invoke` function for every command
 * defined in the backend, ensuring type safety and a single point of entry for all
 * backend communication.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
	FileNode,
	FullPageData,
	PageHeader,
	RenderedPage,
	TagMap,
} from "./bindings";

// --- Vault Commands ---

/**
 * Retrieves the stored vault path from the configuration file.
 * @returns A promise that resolves to the vault path string or null if not set.
 */
export const getVaultPath = () => invoke<string | null>("get_vault_path");

/**
 * Sets the vault path, saves it to config, and initializes the world state.
 * @param path The absolute path to the new vault directory.
 * @returns A promise that resolves when the vault is successfully initialized.
 */
export const initializeVault = (path: string) => invoke<void>("initialize_vault", { path });

// --- Sidebar and Indexing Commands ---

/**
 * Returns the hierarchical file tree structure of the vault.
 * @returns A promise that resolves to the root FileNode of the vault.
 */
export const getFileTree = () => invoke<FileNode>("get_file_tree");

/**
 * Returns the tag index mapping tags to lists of pages that contain them.
 * @returns A promise that resolves to a map of tags to page paths.
 */
export const getAllTags = () => invoke<TagMap>("get_all_tags");

/**
 * Returns a list of all directory paths in the vault.
 * @returns A promise that resolves to an array of directory path strings.
 */
export const getAllDirectoryPaths = () => invoke<string[]>("get_all_directory_paths");

// --- Page & File Operation Commands ---

/**
 * Parses a file on disk, renders it, and returns all data needed for the file view.
 * @param path The path to the file to build the view for.
 * @returns A promise that resolves to the complete data for the page view.
 */
export const buildPageView = (path: string) => invoke<FullPageData>("build_page_view", { path });

/**
 * Writes new content to a page on disk.
 * @param path The path of the file to write to.
 * @param content The new markdown content to save.
 * @returns A promise that resolves when the file has been written.
 */
export const writePageContent = (path: string, content: string) =>
	invoke("write_page_content", { path, content });

/**
 * Renders a preview of markdown content without saving it to disk.
 * @param content The raw markdown content to render.
 * @returns A promise that resolves to the rendered page data.
 */
export const renderPagePreview = (content: string) =>
	invoke<RenderedPage>("render_page_preview", { content });

/**
 * Renders pure markdown content (no wikilink resolution, or YAML frontmatter)
 * @param content The raw markdown content to render.
 * @returns A promise that resolves to the rendered page data.
 */
export const renderMarkdown = (content: string) =>
	invoke<RenderedPage>("render_markdown", { content });

/**
 * Creates a new, empty markdown file.
 * @param parentDir The directory where the new file should be created.
 * @param fileName The name for the new file.
 * @returns A promise that resolves to the header data of the newly created page.
 */
export const createNewFile = (parentDir: string, fileName: string) =>
	invoke<PageHeader>("create_new_file", { parentDir, fileName });

/**
 * Creates a new, empty folder.
 * @param parentDir The directory where the new folder should be created.
 * @param folderName The name for the new folder.
 */
export const createNewFolder = (parentDir: string, folderName: string) =>
	invoke<void>("create_new_folder", { parentDir, folderName });

/**
 * Renames a file or folder.
 * @param path The current path of the item to rename.
 * @param newName The new name for the item.
 */
export const renamePath = (path: string, newName: string) =>
	invoke<void>("rename_path", { path, newName });

/**
 * Deletes a file or folder.
 * @param path The path of the item to delete.
 */
export const deletePath = (path: string) => invoke<void>("delete_path", { path });

// --- Importer Commands ---

/**
 * Checks if Pandoc is installed in the application's config directory.
 * @returns A promise that resolves to true if Pandoc is found, false otherwise.
 */
export const isPandocInstalled = () => invoke<boolean>("is_pandoc_installed");

/**
 * Downloads and extracts Pandoc to the application's config directory.
 * @returns A promise that resolves when Pandoc has been successfully downloaded.
 */
export const downloadPandoc = () => invoke<void>("download_pandoc");

/**
 * Imports a list of .docx files, converting them to Markdown.
 * @param docxPaths An array of paths to the .docx files to import.
 * @returns A promise that resolves to an array of paths of the newly created Markdown files.
 */
export const importDocxFiles = (docxPaths: string[]) =>
	invoke<string[]>("import_docx_files", { docxPaths });

// --- System Commands ---

/**
 * A command that checks for the "APPIMAGE" environment variable on Linux
 * to determine the installation method.
 * @returns {Promise<string>} A promise that resolves to either "appimage" or "other".
 */
export function getLinuxInstallType(): Promise<string> {
	return invoke("get_linux_install_type");
}
