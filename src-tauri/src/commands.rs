//! Tauri command handlers for the worldbuilding application.
//!
//! These commands bridge the frontend (Svelte/JavaScript) and backend (Rust) functionality.
//! All commands are async-capable and automatically manage thread safety via Tauri's State system.

use crate::{
    error::Result,
    models::{FileNode, PageHeader, RenderedPage},
    world::World,
};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{command, AppHandle, State};
use tracing::instrument;

/// Initializes the application by scanning a vault directory and starting the file watcher.
#[command]
#[instrument(skip(world, _app_handle))]
pub fn initialize(path: String, world: State<World>, _app_handle: AppHandle) -> Result<()> {
    world.initialize()
}

/// Returns a lightweight list of all indexed pages (title and path).
#[command]
#[instrument(skip(world))]
pub fn get_all_pages(world: State<World>) -> Result<Vec<PageHeader>> {
    world.get_all_pages()
}

/// Returns the tag index mapping tags to lists of pages that contain them.
#[command]
#[instrument(skip(world))]
pub fn get_all_tags(world: State<World>) -> Result<Vec<(String, Vec<PathBuf>)>> {
    world.get_all_tags()
}

/// Reads and returns the raw Markdown content of a specific page.
#[command]
#[instrument]
pub fn get_page_content(path: String) -> Result<String> {
    fs::read_to_string(path).map_err(Into::into)
}

/// Processes raw markdown content, renders it to HTML with wikilinks resolved,
/// and returns a structured object for the frontend preview.
#[command]
#[instrument(skip(content, world))]
pub fn get_rendered_page(content: String, world: State<World>) -> Result<RenderedPage> {
    world.get_rendered_page(&content)
}

/// Writes content to a page on disk.
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
pub fn get_file_tree(world: State<World>) -> Result<FileNode> {
    world.get_file_tree()
}

/// Manually triggers an index update for a specific file.
#[command]
#[instrument(skip(world))]
pub fn update_file(world: State<World>, path: PathBuf) -> Result<()> {
    world.update_file(&path)
}
