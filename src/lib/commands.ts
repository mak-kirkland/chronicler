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
    BrokenLink,
    ParseError,
    UserFont,
} from "./bindings";
import type { MapConfig } from "./mapModels";

// --- Vault Commands ---

/**
 * Retrieves the stored vault path from the configuration file.
 * @returns A promise that resolves to the vault path string or null if not set.
 */
export const getVaultPath = () => invoke<string | null>("get_vault_path");

/**
 * Retrieves the list of recently opened vaults from the configuration.
 * @returns A promise that resolves to an array of path strings.
 */
export const getRecentVaults = () => invoke<string[]>("get_recent_vaults");

/**
 * Removes a vault path from the recent vaults history.
 * @param path The path to remove.
 */
export const removeRecentVault = (path: string) =>
    invoke<void>("remove_recent_vault", { path });

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

/**
 * Returns a list of all broken links in the vault.
 * @returns A promise that resolves to an array of BrokenLink objects.
 */
export const getAllBrokenLinks = () =>
    invoke<BrokenLink[]>("get_all_broken_links");

/**
 * Returns a list of all broken image references in the vault.
 * @returns A promise that resolves to an array of BrokenLink objects.
 */
export const getAllBrokenImages = () =>
    invoke<BrokenLink[]>("get_all_broken_images");

/**
 * Returns a list of all pages with YAML parsing errors.
 * @returns A promise that resolves to an array of ParseError objects.
 */
export const getAllParseErrors = () =>
    invoke<ParseError[]>("get_all_parse_errors");

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
 * Renames a file or folder in-place and returns its new path.
 * @param path The current path of the item to rename.
 * @param newName The new name for the item.
 * @returns A promise that resolves to the new path of the renamed item.
 */
export const renamePath = (path: string, newName: string) =>
    invoke<string>("rename_path", { path, newName });

/**
 * Deletes a file or folder.
 * @param path The path of the item to delete.
 */
export const deletePath = (path: string) =>
    invoke<void>("delete_path", { path });

/**
 * Moves a file or folder to a new directory and returns its new path.
 * This command delegates path construction to the backend, making it platform-safe.
 * @param sourcePath The full path of the item to move.
 * @param destDir The full path of the target directory.
 * @returns A promise that resolves to the new path of the moved item.
 */
export const movePath = (sourcePath: string, destDir: string) =>
    invoke<string>("move_path", { sourcePath, destDir });

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
 * Opens the directory where application logs are stored.
 */
export const openLogDirectory = () => invoke<void>("open_log_directory");

/**
 * Converts an image at a given path to a Base64 Data URL.
 * @param path The absolute or relative path to the image file.
 * @returns A promise that resolves to the Base64 Data URL string.
 */
export const getImageAsBase64 = (path: string) =>
    invoke<string>("get_image_as_base64", { path });

/**
 * Returns the best source string (Asset URL or Base64) for a given image path.
 * Handles symlinks by checking if they are safe for the Asset Protocol.
 * @param path The absolute path to the image file.
 * @returns A promise resolving to the source string.
 */
export const getImageSource = (path: string) =>
    invoke<string>("get_image_source", { path });

/**
 * Reads and parses a `.map.json` file from within the vault.
 * @param path The absolute path to the map config file.
 * @returns A promise that resolves to the parsed map configuration.
 */
export const getMapConfig = (path: string) =>
    invoke<MapConfig>("get_map_config", { path });

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

/**
 * Imports all .docx files found within a given folder.
 * @param folderPath The absolute path to the folder to scan.
 * @returns A promise that resolves to an array of paths of the newly created Markdown files.
 */
export const importDocxFromFolder = (folderPath: string) =>
    invoke<string[]>("import_docx_from_folder", { folderPath });

/**
 * Imports a MediaWiki XML dump file.
 * @param xmlPath The path to the MediaWiki XML dump file.
 * @returns A promise that resolves to an array of paths of the newly created Markdown files.
 */
export const importMediawikiDump = (xmlPath: string) =>
    invoke<string[]>("import_mediawiki_dump", { xmlPath });

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

// --- Custom Font Commands ---

/**
 * Scans the application's config directory for user-provided font files.
 * @returns A promise that resolves to an array of UserFont objects.
 */
export const getUserFonts = () => invoke<UserFont[]>("get_user_fonts");
