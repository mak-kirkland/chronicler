//! Central application state manager.
//!
//! Coordinates the indexer, watcher, and frontend communication.

use crate::{
    config,
    error::{ChroniclerError, Result},
    importer,
    indexer::Indexer,
    models::{FileNode, FullPageData, PageHeader, RenderedPage},
    renderer::Renderer,
    watcher::Watcher,
};
use parking_lot::{Mutex, RwLock};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;
use tracing::{info, instrument};

/// The main `World` struct containing all application subsystems and state.
///
/// This struct acts as the single source of truth for the backend. It is wrapped in a `tauri::State`
/// managed `Mutex` in `main.rs`, ensuring that all access to it from frontend commands is sequential
/// and safe.
#[derive(Debug, Default)]
pub struct World {
    /// The root directory of the worldbuilding vault.
    root_path: Option<PathBuf>,
    /// Thread-safe, shared access to the vault indexer.
    pub indexer: Arc<RwLock<Indexer>>,
    /// The application's file system watcher.
    watcher: Option<Mutex<Watcher>>,
    /// The application's Markdown renderer.
    pub renderer: Option<Renderer>,
}

impl World {
    /// Creates a new, uninitialized `World` instance.
    pub fn new() -> Self {
        Self::default()
    }

    /// Initializes the world by performing a full scan of the vault directory and starting
    /// the file watcher. This is an internal method called by `change_vault`.
    fn initialize(&mut self, root_path: &Path, app_handle: AppHandle) -> Result<()> {
        info!(path = %root_path.display(), "Initializing or changing vault.");

        // If a watcher exists, its Drop implementation will stop the old thread.
        if self.watcher.is_some() {
            info!("Shutting down existing watcher for vault change.");
            self.watcher = None;
        }

        self.root_path = Some(root_path.to_path_buf());

        // Re-initialize the indexer and renderer
        let new_indexer = Arc::new(RwLock::new(Indexer::new(root_path)));
        self.renderer = Some(Renderer::new(new_indexer.clone()));
        self.indexer = new_indexer;

        // --- 1. Perform Initial Scan ---
        self.indexer.write().full_scan(root_path)?;

        // --- 2. Start File Watcher ---
        let mut new_watcher = Watcher::new();
        new_watcher.start(root_path)?;

        // --- 3. Subscribe to File Events ---
        let event_receiver = new_watcher.subscribe();
        self.watcher = Some(Mutex::new(new_watcher));

        // --- 4. Spawn Background Event Processing Task ---
        let indexer_clone = self.indexer.clone();
        // Use Tauri's async runtime instead of tokio::spawn
        tauri::async_runtime::spawn(async move {
            Self::process_file_events(app_handle, indexer_clone, event_receiver).await;
        });

        info!(
            "World initialized successfully for path: {}",
            root_path.display()
        );
        Ok(())
    }

    /// Changes the vault path, saves the configuration, and re-initializes the world.
    pub fn change_vault(&mut self, path: String, app_handle: AppHandle) -> Result<()> {
        // 1. Save the new path to the configuration file.
        config::set_vault_path(path.clone(), &app_handle)?;

        // 2. Initialize the world with the new path.
        self.initialize(Path::new(&path), app_handle)
    }

    /// Background task that processes file events and updates the indexer.
    ///
    /// This runs in a separate async task and handles the event loop for file changes.
    /// It continues until the event channel is closed or an unrecoverable error occurs.
    ///
    /// # Arguments
    /// * `app_handle` - A handle to the Tauri application
    /// * `indexer` - Shared reference to the indexer
    /// * `mut event_receiver` - Receiver for file change events
    #[instrument(level = "debug", skip(app_handle, indexer, event_receiver))]
    async fn process_file_events(
        app_handle: AppHandle,
        indexer: Arc<RwLock<Indexer>>,
        mut event_receiver: broadcast::Receiver<crate::events::FileEvent>,
    ) {
        loop {
            match event_receiver.recv().await {
                Ok(event) => {
                    // Scope the write lock to release it before emitting the event
                    {
                        let mut indexer = indexer.write();
                        indexer.handle_file_event(&event);
                    } // Lock is released here

                    // Emit an event to notify the frontend that the index has changed
                    if let Err(e) = app_handle.emit("index-updated", ()) {
                        tracing::error!("Failed to emit index-updated event: {}", e);
                    }
                }
                Err(broadcast::error::RecvError::Closed) => {
                    tracing::info!("Event channel closed, stopping file event processing");
                    break;
                }
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(
                        "File event processing fell behind, skipped {} events",
                        skipped
                    );
                    // Continue processing - the indexer will eventually catch up
                }
            }
        }
        tracing::info!("File event processing task stopped");
    }

    /// Converts docx files and adds them to the vault, then updates the index.
    pub fn import_docx_files(
        &self,
        app_handle: &AppHandle,
        docx_paths: Vec<PathBuf>,
    ) -> Result<Vec<PathBuf>> {
        let output_dir = self
            .root_path
            .clone()
            .ok_or(crate::error::ChroniclerError::VaultNotInitialized)?;

        let converted_paths =
            importer::convert_docx_to_markdown(app_handle, docx_paths, output_dir)?;

        let mut indexer = self.indexer.write();
        for path in &converted_paths {
            indexer.update_file(path);
        }

        Ok(converted_paths)
    }

    // --- Data Accessors ---

    /// Returns all tags and the pages that reference them, sorted alphabetically.
    pub fn get_all_tags(&self) -> Result<Vec<(String, Vec<PageHeader>)>> {
        self.indexer.read().get_all_tags()
    }

    /// Returns the file tree structure of the vault for frontend display.
    pub fn get_file_tree(&self) -> Result<FileNode> {
        self.indexer.read().get_file_tree()
    }

    /// Processes raw markdown content and returns the fully rendered page data.
    pub fn render_page_preview(&self, content: &str) -> Result<RenderedPage> {
        self.renderer
            .as_ref()
            .ok_or(crate::error::ChroniclerError::VaultNotInitialized)?
            .render_page_preview(content)
    }

    /// Renders a string of pure Markdown to a `RenderedPage` object.
    /// This bypasses all wikilink and frontmatter processing.
    pub fn render_markdown(&self, markdown: &str) -> Result<RenderedPage> {
        self.renderer
            .as_ref()
            .ok_or(ChroniclerError::VaultNotInitialized)?
            .render_markdown(markdown)
    }

    /// Fetches and renders all data required for the main file view.
    pub fn build_page_view(&self, path: &str) -> Result<FullPageData> {
        self.renderer
            .as_ref()
            .ok_or(crate::error::ChroniclerError::VaultNotInitialized)?
            .build_page_view(path)
    }

    /// Returns a list of all directory paths in the vault.
    pub fn get_all_directory_paths(&self) -> Result<Vec<PathBuf>> {
        self.indexer.read().get_all_directory_paths()
    }

    // --- File System Operations ---

    /// Writes content to a page on disk.
    /// This method doesn't need to modify the index directly, as the file watcher
    /// will detect the change and send an event.
    pub fn write_page_content(&self, path: &str, content: &str) -> Result<()> {
        let path_buf = PathBuf::from(path);
        if let Some(parent) = path_buf.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path_buf, content).map_err(Into::into)
    }

    /// Creates a new, empty markdown file and synchronously updates the index.
    pub fn create_new_file(&self, parent_dir: String, file_name: String) -> Result<PageHeader> {
        self.indexer.write().create_new_file(parent_dir, file_name)
    }

    /// Creates a new, empty folder.
    pub fn create_new_folder(&self, parent_dir: String, folder_name: String) -> Result<()> {
        self.indexer
            .write()
            .create_new_folder(parent_dir, folder_name)
    }

    /// Renames a file or folder and synchronously updates the index.
    pub fn rename_path(&self, path: PathBuf, new_name: String) -> Result<()> {
        self.indexer.write().rename_path(path, new_name)
    }

    /// Deletes a file or folder and synchronously updates the index.
    pub fn delete_path(&self, path: PathBuf) -> Result<()> {
        self.indexer.write().delete_path(path)
    }
}
