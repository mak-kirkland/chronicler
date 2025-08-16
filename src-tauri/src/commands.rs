//! Tauri command handlers for the worldbuilding application.
//!
//! These commands bridge the frontend (Svelte/JavaScript) and backend (Rust) functionality.
//! All commands are async-capable and automatically manage thread safety via Tauri's State system.

use crate::licensing;
use crate::licensing::License;
use crate::models::{FullPageData, PageHeader};
use crate::{
    config,
    error::Result,
    importer,
    models::{FileNode, RenderedPage},
    world::World,
};
use std::path::PathBuf;
use tauri::{command, AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tracing::instrument;

// --- Vault and Initialization ---

/// Retrieves the stored vault path from the configuration file.
#[command]
#[instrument(skip(app_handle))]
pub fn get_vault_path(app_handle: AppHandle) -> Result<Option<String>> {
    config::get_vault_path(&app_handle)
}

/// Sets the vault path, saves it to config, and initializes the world state.
/// This uses fine-grained locking internally instead of a single write lock on the world.
#[command]
#[instrument(skip(world, app_handle))]
pub fn initialize_vault(path: String, world: State<World>, app_handle: AppHandle) -> Result<()> {
    world.change_vault(path, app_handle)
}

// --- Data Retrieval ---

/// Returns the tag index, mapping tags to lists of pages that contain them.
#[command]
#[instrument(skip(world))]
pub fn get_all_tags(world: State<World>) -> Result<Vec<(String, Vec<PageHeader>)>> {
    world.get_all_tags()
}

/// Returns the hierarchical file tree structure of the vault.
#[command]
#[instrument(skip(world))]
pub fn get_file_tree(world: State<World>) -> Result<FileNode> {
    world.get_file_tree()
}

/// Returns a list of all directory paths in the vault.
#[command]
#[instrument(skip(world))]
pub fn get_all_directory_paths(world: State<World>) -> Result<Vec<PathBuf>> {
    world.get_all_directory_paths()
}

// --- Page Rendering and Content ---

/// Processes raw markdown content, renders it to HTML with wikilinks resolved,
/// and returns a structured object for the frontend preview.
#[command]
#[instrument(skip(content, world))]
pub fn render_page_preview(content: String, world: State<World>) -> Result<RenderedPage> {
    world.render_page_preview(&content)
}

/// Parses the file on disk, renders the markdown to HTML, and returns a composed
/// object containing the raw content, and the rendered preview.
#[command]
#[instrument(skip(world))]
pub fn build_page_view(path: String, world: State<World>) -> Result<FullPageData> {
    world.build_page_view(&path)
}

/// Renders a string of pure Markdown to a `RenderedPage` object containing only HTML.
/// This command does not process wikilinks or frontmatter.
#[command]
#[instrument(skip(content, world))]
pub fn render_markdown(content: String, world: State<World>) -> Result<RenderedPage> {
    world.render_markdown(&content)
}

/// Converts a relative or absolute image path to a Base64 Data URL string.
#[command]
#[instrument(skip(world))]
pub fn get_image_as_base64(path: String, world: State<World>) -> Result<String> {
    world.get_image_as_base64(&path)
}

// --- File and Folder Operations ---

/// Writes content to a page on disk. The file watcher will pick up the change.
#[command]
#[instrument(skip(world, content))]
pub fn write_page_content(world: State<World>, path: String, content: String) -> Result<()> {
    world.write_page_content(&path, &content)
}

/// Creates a new, empty markdown file and synchronously updates the index.
#[command]
#[instrument(skip(world))]
pub fn create_new_file(
    world: State<World>,
    parent_dir: String,
    file_name: String,
) -> Result<PageHeader> {
    world.create_new_file(parent_dir, file_name)
}

/// Creates a new, empty folder.
#[command]
#[instrument(skip(world))]
pub fn create_new_folder(
    world: State<World>,
    parent_dir: String,
    folder_name: String,
) -> Result<()> {
    world.create_new_folder(parent_dir, folder_name)
}

/// Renames a file or folder on disk (in-place) and updates the index.
#[command]
#[instrument(skip(world))]
pub fn rename_path(world: State<World>, path: String, new_name: String) -> Result<()> {
    world.rename_path(PathBuf::from(path), new_name)
}

/// Deletes a file or folder from disk and updates the index.
#[command]
#[instrument(skip(world))]
pub fn delete_path(world: State<World>, path: String) -> Result<()> {
    world.delete_path(PathBuf::from(path))
}

/// Moves a file or folder to a new directory and updates the index and backlinks.
#[command]
#[instrument(skip(world))]
pub fn move_path(world: State<World>, source_path: String, dest_dir: String) -> Result<()> {
    world.move_path(PathBuf::from(source_path), PathBuf::from(dest_dir))
}

/// Checks if a file or directory exists at the given path.
#[command]
pub fn path_exists(path: PathBuf) -> bool {
    path.exists()
}

/// Opens the specified path in the OS's default file explorer.
#[command]
pub fn open_in_explorer(app_handle: AppHandle, path: String) -> Result<()> {
    app_handle.opener().open_path(path, None::<&str>)?;
    Ok(())
}

// --- Importer ---

/// Imports a list of .docx files, converting them to Markdown.
#[command]
#[instrument(skip(world, app_handle))]
pub fn import_docx_files(
    world: State<World>,
    app_handle: AppHandle,
    docx_paths: Vec<PathBuf>,
) -> Result<Vec<PathBuf>> {
    world.import_docx_files(&app_handle, docx_paths)
}

/// Checks if Pandoc is installed in the application's config directory.
#[command]
#[instrument(skip(app_handle))]
pub fn is_pandoc_installed(app_handle: AppHandle) -> Result<bool> {
    importer::is_pandoc_installed(&app_handle)
}

/// Downloads and extracts Pandoc to the application's config directory.
#[command]
#[instrument(skip(app_handle))]
pub async fn download_pandoc(app_handle: AppHandle) -> Result<()> {
    importer::download_pandoc(app_handle).await
}

// --- Licensing ---

/// Retrieves the current license status from the stored license file.
#[command]
#[instrument(skip(app_handle))]
pub fn get_license_status(app_handle: AppHandle) -> Result<Option<License>> {
    licensing::load_license(&app_handle)
}

/// Verifies a license key, and if valid, saves it to the config directory.
#[command]
#[instrument(skip(app_handle, license_key))]
pub async fn verify_and_store_license(
    app_handle: AppHandle,
    license_key: String,
) -> Result<License> {
    let license = licensing::validate_license(&license_key).await?;
    licensing::save_license(&app_handle, &license)?;
    Ok(license)
}

// --- System ---

/// Checks for the "APPIMAGE" environment variable to determine if the
/// application is running as an AppImage on Linux.
#[command]
#[instrument]
pub fn get_linux_install_type() -> String {
    // The APPIMAGE env var is set by the AppImage runtime.
    if std::env::var("APPIMAGE").is_ok() {
        "appimage".to_string()
    } else {
        // This indicates it's likely a .deb, .rpm, or other system-managed package.
        "other".to_string()
    }
}
