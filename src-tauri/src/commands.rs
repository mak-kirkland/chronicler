//! Tauri command handlers for the worldbuilding application.
//!
//! These commands bridge the frontend (Svelte/JavaScript) and backend (Rust) functionality.
//! All commands are async-capable and automatically manage thread safety via Tauri's State system.

use crate::models::FullPageData;
use crate::{
    config,
    error::Result,
    models::{FileNode, PageHeader, RenderedPage},
    world::World,
};
use parking_lot::RwLock;
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{command, AppHandle, State};
use tracing::instrument;

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
pub fn set_vault_path_and_initialize(
    path: String,
    world: State<RwLock<World>>,
    app_handle: AppHandle,
) -> Result<()> {
    world.write().change_vault(path, app_handle)
}

/// Returns the tag index mapping tags to lists of pages that contain them.
#[command]
#[instrument(skip(world))]
pub fn get_all_tags(world: State<RwLock<World>>) -> Result<Vec<(String, Vec<PathBuf>)>> {
    world.read().get_all_tags()
}

/// Processes raw markdown content, renders it to HTML with wikilinks resolved,
/// and returns a structured object for the frontend preview.
#[command]
#[instrument(skip(content, world))]
pub fn get_rendered_page(content: String, world: State<RwLock<World>>) -> Result<RenderedPage> {
    world.read().get_rendered_page(&content)
}

/// Gets all data needed for the file view.
#[command]
#[instrument(skip(world))]
pub fn get_page_data_for_view(path: String, world: State<RwLock<World>>) -> Result<FullPageData> {
    world.read().get_page_data_for_view(&path)
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

/// Returns the hierarchical file tree structure of the vault.
#[command]
#[instrument(skip(world))]
pub fn get_file_tree(world: State<RwLock<World>>) -> Result<FileNode> {
    world.read().get_file_tree()
}

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

/// Returns a list of all directory paths in the vault.
#[command]
#[instrument(skip(world))]
pub fn get_all_directory_paths(world: State<RwLock<World>>) -> Result<Vec<PathBuf>> {
    world.read().get_all_directory_paths()
}
