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
    License,
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
export const initializeVault = (path: string) =>
    invoke<void>("initialize_vault", { path });

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
export const getAllDirectoryPaths = () =>
    invoke<string[]>("get_all_directory_paths");

// --- Page & File Operation Commands ---

/**
 * Parses a file on disk, renders it, and returns all data needed for the file view.
 * @param path The path to the file to build the view for.
 * @returns A promise that resolves to the complete data for the page view.
 */
export const buildPageView = (path: string) =>
    invoke<FullPageData>("build_page_view", { path });

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
 * @param templatePath Optional path to a template file to use.
 * @returns A promise that resolves to the header data of the newly created page.
 */
export const createNewFile = (
    parentDir: string,
    fileName: string,
    templatePath?: string | null,
) =>
    invoke<PageHeader>("create_new_file", {
        parentDir,
        fileName,
        templatePath,
    });

/**
 * Creates a new, empty folder.
 * @param parentDir The directory where the new folder should be created.
 * @param folderName The name for the new folder.
 */
export const createNewFolder = (parentDir: string, folderName: string) =>
    invoke<void>("create_new_folder", { parentDir, folderName });

/**
 * Renames a file or folder in-place.
 * @param path The current path of the item to rename.
 * @param newName The new name for the item.
 */
export const renamePath = (path: string, newName: string) =>
    invoke<void>("rename_path", { path, newName });

/**
 * Deletes a file or folder.
 * @param path The path of the item to delete.
 */
export const deletePath = (path: string) =>
    invoke<void>("delete_path", { path });

/**
 * Moves a file or folder to a new directory.
 * This command delegates path construction to the backend, making it platform-safe.
 * @param sourcePath The full path of the item to move.
 * @param destDir The full path of the target directory.
 * @returns A promise that resolves when the item has been moved.
 */
export const movePath = (sourcePath: string, destDir: string) =>
    invoke<void>("move_path", { sourcePath, destDir });

/**
 * Duplicates a page, creating a new file with a numerical suffix.
 * @param path The path of the file to duplicate.
 * @returns A promise that resolves to the header data of the newly created page.
 */
export const duplicatePage = (path: string) =>
    invoke<PageHeader>("duplicate_page", { path });

/**
 * Opens a given path in the OS's default file explorer.
 * @param path The absolute path to the directory or file to open.
 */
export const openInExplorer = (path: string) =>
    invoke<void>("open_in_explorer", { path });

/**
 * Converts an image at a given path to a Base64 Data URL.
 * @param path The absolute or relative path to the image file.
 * @returns A promise that resolves to the Base64 Data URL string.
 */
export const getImageAsBase64 = (path: string) =>
    invoke<string>("get_image_as_base64", { path });

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

// --- Licensing Commands ---

/**
 * Retrieves the current license status from the stored license file.
 * @returns A promise that resolves to the license object or null if not found.
 */
export const getLicenseStatus = () =>
    invoke<License | null>("get_license_status");

/**
 * Verifies a license key, and if valid, saves it to the config directory.
 * @param licenseKey The raw string content of the license file.
 * @returns A promise that resolves to the validated license object.
 */
export const verifyAndStoreLicense = (licenseKey: string) =>
    invoke<License>("verify_and_store_license", { licenseKey });

// --- System Commands ---

/**
 * A command that checks for the "APPIMAGE" environment variable on Linux
 * to determine the installation method.
 * @returns {Promise<string>} A promise that resolves to either "appimage" or "other".
 */
export function getLinuxInstallType(): Promise<string> {
    return invoke("get_linux_install_type");
}

/**
 * Checks the number of days the application has been in use.
 * @returns {Promise<number>} A promise that resolves to the number of days.
 */
export const getAppUsageDays = () => invoke<number>("get_app_usage_days");

// --- Template Commands ---

/**
 * Retrieves a list of all available templates.
 * @returns A promise that resolves to an array of PageHeader objects for the templates.
 */
export const listTemplates = () => invoke<PageHeader[]>("list_templates");

/**
 * Reads the raw content of a specific template file.
 * @param path The path of the template file to read.
 * @returns A promise that resolves to the string content of the template.
 */
export const readTemplate = (path: string) =>
    invoke<string>("read_template", { path });

/**
 * Saves content to a template file.
 * @param name The name of the template (without extension).
 * @param content The new content to save.
 * @returns A promise that resolves to the path of the saved template file.
 */
export const writeTemplate = (name: string, content: string) =>
    invoke<string>("write_template", { name, content });

/**
 * Deletes a template file.
 * @param path The path of the template file to delete.
 * @returns A promise that resolves when the template has been deleted.
 */
export const deleteTemplate = (path: string) =>
    invoke<void>("delete_template", { path });
