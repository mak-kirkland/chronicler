//! Tauri command handlers for the worldbuilding application.
//!
//! These commands bridge the frontend (Svelte/JavaScript) and backend (Rust) functionality.
//! All commands are async-capable and automatically manage thread safety via Tauri's State system.

use crate::models::{FullPageData, PageHeader};
use crate::{
    config,
    error::Result,
    importer,
    models::{FileNode, RenderedPage},
    world::World,
};
use parking_lot::RwLock;
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{command, AppHandle, State};
use tracing::instrument;

// --- Vault and Initialization ---

/// Retrieves the stored vault path from the configuration file.
#[command]
#[instrument(skip(app_handle))]
pub fn get_vault_path(app_handle: AppHandle) -> Result<Option<String>> {
    config::get_vault_path(&app_handle)
}

/// Sets the vault path, saves it to config, and initializes the world state.
/// This requires a write lock because it modifies the World state.
#[command]
#[instrument(skip(world, app_handle))]
pub fn initialize_vault(
    path: String,
    world: State<RwLock<World>>,
    app_handle: AppHandle,
) -> Result<()> {
    world.write().change_vault(path, app_handle)
}

// --- Data Retrieval ---

/// Returns the tag index, mapping tags to lists of pages that contain them.
#[command]
#[instrument(skip(world))]
pub fn get_all_tags(world: State<RwLock<World>>) -> Result<Vec<(String, Vec<PageHeader>)>> {
    world.read().get_all_tags()
}

/// Returns the hierarchical file tree structure of the vault.
#[command]
#[instrument(skip(world))]
pub fn get_file_tree(world: State<RwLock<World>>) -> Result<FileNode> {
    world.read().get_file_tree()
}

/// Returns a list of all directory paths in the vault.
#[command]
#[instrument(skip(world))]
pub fn get_all_directory_paths(world: State<RwLock<World>>) -> Result<Vec<PathBuf>> {
    world.read().get_all_directory_paths()
}

// --- Page Rendering and Content ---

/// Processes raw markdown content, renders it to HTML with wikilinks resolved,
/// and returns a structured object for the frontend preview.
#[command]
#[instrument(skip(content, world))]
pub fn render_page_preview(content: String, world: State<RwLock<World>>) -> Result<RenderedPage> {
    world.read().render_page_preview(&content)
}

/// Parses the file on disk, renders the markdown to HTML, and returns a composed
/// object containing the raw content, and the rendered preview.
#[command]
#[instrument(skip(world))]
pub fn build_page_view(path: String, world: State<RwLock<World>>) -> Result<FullPageData> {
    world.read().build_page_view(&path)
}

/// Writes content to a page on disk. This does not modify the World state directly,
/// so it doesn't need a lock on the World. The file watcher will pick up the change.
#[command]
#[instrument]
pub fn write_page_content(path: String, content: String) -> Result<()> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content).map_err(Into::into)
}

/// Renders a string of pure Markdown to a `RenderedPage` object containing only HTML.
/// This command does not process wikilinks or frontmatter, making it suitable
/// for rendering content like the help file where `[[wikilink]]` syntax needs to be
/// displayed literally.
#[command]
#[instrument(skip(content, world))]
pub fn render_markdown(content: String, world: State<RwLock<World>>) -> Result<RenderedPage> {
    world.read().render_markdown(&content)
}

// --- File and Folder Operations ---

/// Creates a new, empty markdown file and synchronously updates the index.
#[command]
#[instrument(skip(world))]
pub fn create_new_file(
    world: State<RwLock<World>>,
    parent_dir: String,
    file_name: String,
) -> Result<PageHeader> {
    world.read().create_new_file(parent_dir, file_name)
}

/// Creates a new, empty folder. This uses a read lock on the world,
/// but a write lock on the indexer internally.
#[command]
#[instrument(skip(world))]
pub fn create_new_folder(
    world: State<RwLock<World>>,
    parent_dir: String,
    folder_name: String,
) -> Result<()> {
    world.read().create_new_folder(parent_dir, folder_name)
}

/// Renames a file or folder on disk. This uses a read lock on the world,
/// but a write lock on the indexer internally.
#[command]
#[instrument(skip(world))]
pub fn rename_path(world: State<RwLock<World>>, path: String, new_name: String) -> Result<()> {
    world.read().rename_path(PathBuf::from(path), new_name)
}

/// Deletes a file or folder from disk. This uses a read lock on the world,
/// but a write lock on the indexer internally.
#[command]
#[instrument(skip(world))]
pub fn delete_path(world: State<RwLock<World>>, path: String) -> Result<()> {
    world.read().delete_path(PathBuf::from(path))
}

// --- Importer ---

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

/// Imports a list of .docx files, converting them to Markdown.
#[command]
#[instrument(skip(world, app_handle))]
pub fn import_docx_files(
    world: State<RwLock<World>>,
    app_handle: AppHandle,
    docx_paths: Vec<PathBuf>,
) -> Result<Vec<PathBuf>> {
    world.read().import_docx_files(&app_handle, docx_paths)
}

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
