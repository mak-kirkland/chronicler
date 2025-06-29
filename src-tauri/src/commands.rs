//! Tauri command handlers for the worldbuilding application.
//!
//! These commands bridge the frontend (Svelte/JavaScript) and backend (Rust) functionality.
//! All commands are async-capable and automatically manage thread safety via Tauri's State system.

use crate::{
    error::Result,
    models::{FileNode, PageHeader},
    world::World,
};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};
use tauri::{command, AppHandle, State};
use tracing::instrument;

/// Initializes the application by scanning a vault directory and starting the file watcher.
/// This should be called once when the user selects their vault folder.
///
/// # Arguments
/// * `path` - String path to the vault directory
/// * `world` - The application state
/// * `app_handle` - Tauri application handle for event emission
///
/// # Returns
/// `Result<()>` indicating success or failure
#[command]
#[instrument(skip(world, _app_handle))]
pub fn initialize(path: String, world: State<World>, _app_handle: AppHandle) -> Result<()> {
    world.initialize()
}

/// Returns a lightweight list of all indexed pages (title and path).
///
/// # Arguments
/// * `world` - The application state
///
/// # Returns
/// `Result<Vec<PageHeader>>` containing the title to path mappings
#[command]
#[instrument(skip(world))]
pub fn get_all_pages(world: State<World>) -> Result<Vec<PageHeader>> {
    world.get_all_pages()
}

/// Returns the tag index mapping tags to lists of pages that contain them.
///
/// # Arguments
/// * `world` - The application state
///
/// # Returns
/// `Result<HashMap<String, Vec<PathBuf>>>` where keys are tags and values are page paths
#[command]
#[instrument(skip(world))]
pub fn get_all_tags(world: State<World>) -> Result<HashMap<String, Vec<PathBuf>>> {
    world.get_all_tags()
}

/// Reads and returns the raw Markdown content of a specific page.
/// This bypasses the index for direct filesystem access.
///
/// # Arguments
/// * `path` - Absolute path to the Markdown file
///
/// # Returns
/// `Result<String>` containing the file content
#[command]
#[instrument]
pub fn get_page_content(path: String) -> Result<String> {
    fs::read_to_string(path).map_err(Into::into)
}

/// Writes content to a page on disk. The file watcher will automatically
/// detect this change and trigger a re-index.
///
/// # Arguments
/// * `path` - Absolute path where the file should be written
/// * `content` - Markdown content to write
///
/// # Returns
/// `Result<()>` indicating success or failure
#[command]
#[instrument]
pub fn write_page_content(path: String, content: String) -> Result<()> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content).map_err(Into::into)
}

/// Returns the hierarchical file tree structure of the vault.
///
/// # Arguments
/// * `world` - The application state
///
/// # Returns
/// `Result<FileNode>` representing the root of the file tree
#[command]
#[instrument(skip(world))]
pub fn get_file_tree(world: State<World>) -> Result<FileNode> {
    world.get_file_tree()
}

/// Manually triggers an index update for a specific file.
/// Typically called after programmatic file modifications.
///
/// # Arguments
/// * `world` - The application state
/// * `path` - Path to the file that needs updating
///
/// # Returns
/// `Result<()>` indicating success or failure
#[command]
#[instrument(skip(world))]
pub fn update_file(world: State<World>, path: PathBuf) -> Result<()> {
    world.update_file(&path)
}
