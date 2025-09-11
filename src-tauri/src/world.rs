//! Central application state manager.
//!
//! This module defines the `World` struct, which acts as the single source of
//! truth and coordinator for all backend subsystems. It manages the `Indexer`,
//! the file `Watcher`, the `Renderer`, and the file system `Writer`.
//!
//! The `World` is responsible for:
//! - Initializing the application state when a vault is opened.
//! - Spawning and managing the asynchronous task that listens for file changes.
//! - Handling the distinction between synchronous UI-driven actions and
//!   asynchronous file system events to ensure both responsiveness and performance.
//! - Providing a unified API for Tauri commands to interact with the backend.

use crate::{
    config::{self, DEBOUNCE_INTERVAL},
    error::{ChroniclerError, Result},
    events::FileEvent,
    importer,
    indexer::Indexer,
    models::{BrokenLink, FileNode, FullPageData, PageHeader, RenderedPage},
    renderer::Renderer,
    template,
    watcher::Watcher,
    writer::Writer,
};
use parking_lot::{Mutex, RwLock};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{AppHandle, Emitter};
use tokio::{sync::broadcast, time::sleep};
use tracing::{error, info, instrument};

/// The main `World` struct containing all application subsystems and state.
///
/// This struct acts as the single source of truth for the backend. It is managed
/// directly by `tauri::State`. Its fields are wrapped in thread-safe containers
/// like `Arc<RwLock<T>>` to allow for granular locking, preventing performance
/// bottlenecks where a long write operation would block unrelated read operations.
#[derive(Debug, Clone)]
pub struct World {
    /// The root directory of the worldbuilding vault, protected for concurrent access.
    pub root_path: Arc<RwLock<Option<PathBuf>>>,
    /// Thread-safe, shared access to the vault indexer.
    pub indexer: Arc<RwLock<Indexer>>,
    /// The application's file system watcher. Wrapped in a Mutex to allow safe swapping
    /// when the vault path changes.
    watcher: Arc<Mutex<Option<Watcher>>>,
    /// The application's Markdown renderer. It is created when a vault is initialized.
    pub renderer: Arc<RwLock<Option<Renderer>>>,
    /// A component for handling all file system write operations.
    writer: Arc<RwLock<Option<Writer>>>,
}

impl World {
    /// Creates a new, uninitialized `World` instance.
    ///
    /// This constructor sets up the shared, thread-safe state containers. The actual
    /// vault data is not loaded until `initialize_vault` is called.
    pub fn new() -> Self {
        // The indexer is created empty and wrapped for concurrent access.
        let indexer = Arc::new(RwLock::new(Indexer::default()));

        Self {
            root_path: Arc::new(RwLock::new(None)),
            indexer,
            renderer: Arc::new(RwLock::new(None)),
            // The watcher starts as None and is created when a vault is initialized.
            watcher: Arc::new(Mutex::new(None)),
            writer: Arc::new(RwLock::new(None)),
        }
    }

    /// Initializes the world by performing a full scan of the vault directory and starting
    /// the file watcher. This is an internal method called by `change_vault`.
    /// This function modifies the interior state via locks.
    fn initialize(&self, root_path: &Path, app_handle: AppHandle) -> Result<()> {
        info!(path = %root_path.display(), "Initializing or changing vault.");

        // --- 1. Perform Initial Scan on a new Indexer instance ---
        // This is done outside of any locks to avoid blocking other operations during the scan.
        let mut new_indexer_instance = Indexer::new(root_path);
        new_indexer_instance.scan_vault(root_path)?;

        // --- 2. Start File Watcher ---
        let mut new_watcher = Watcher::new();
        new_watcher.start(root_path)?;

        // --- 3. Subscribe to File Events ---
        let event_receiver = new_watcher.subscribe();

        // --- 4. Create File System Writer and Renderer ---
        let new_writer = Writer::new();
        // The Renderer is created here, now that we have the vault path.
        let new_renderer = Renderer::new(self.indexer.clone(), root_path.to_path_buf());

        // --- 5. Lock and Update Shared State ---
        // The lock scope is kept as short as possible.
        {
            // The watcher is replaced. The old watcher is dropped, automatically stopping its thread.
            *self.watcher.lock() = Some(new_watcher);
            *self.root_path.write() = Some(root_path.to_path_buf());
            // The fully scanned indexer replaces the old one.
            *self.indexer.write() = new_indexer_instance;
            *self.writer.write() = Some(new_writer);
            // Set the newly created renderer.
            *self.renderer.write() = Some(new_renderer);
        }

        // --- 6. Spawn Background Event Processing Task ---
        // The task is given its own handle to the world's state.
        let indexer_clone = self.indexer.clone();
        let writer_clone = self.writer.clone();
        // Use Tauri's async runtime instead of tokio::spawn
        tauri::async_runtime::spawn(async move {
            Self::process_file_events(app_handle, indexer_clone, writer_clone, event_receiver)
                .await;
        });

        info!(
            "World initialized successfully for path: {}",
            root_path.display()
        );
        Ok(())
    }

    /// Changes the vault path, saves the configuration, and re-initializes the world.
    pub fn change_vault(&self, path: String, app_handle: AppHandle) -> Result<()> {
        // 1. Save the new path to the configuration file.
        config::set_vault_path(path.clone(), &app_handle)?;

        // 2. Initialize the world with the new path.
        self.initialize(Path::new(&path), app_handle)
    }

    /// Background task that collects and processes file events from the watcher.
    ///
    /// This task implements a debouncing and batching strategy. It waits for an
    /// initial event, then waits for a short duration (100ms) to collect any
    /// other events that have occurred in rapid succession. This batch is then
    /// processed by the `Indexer` in one go, preventing repeated, expensive
    /// relationship rebuilds.
    #[instrument(level = "debug", skip(app_handle, indexer, writer, event_receiver))]
    async fn process_file_events(
        app_handle: AppHandle,
        indexer: Arc<RwLock<Indexer>>,
        writer: Arc<RwLock<Option<Writer>>>,
        mut event_receiver: broadcast::Receiver<FileEvent>,
    ) {
        loop {
            // --- 1. Event Collection ---
            let mut events_batch = Vec::new();
            match event_receiver.recv().await {
                Ok(first_event) => {
                    events_batch.push(first_event);
                    // Wait a moment to see if more events are coming.
                    sleep(DEBOUNCE_INTERVAL).await;
                    // Drain any other events that have queued up.
                    while let Ok(event) = event_receiver.try_recv() {
                        events_batch.push(event);
                    }
                }
                Err(broadcast::error::RecvError::Closed) => {
                    info!("Event channel closed, stopping file event processing");
                    break;
                }
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(
                        "File event processing fell behind, skipped {} events",
                        skipped
                    );
                    continue; // Skip to next iteration
                }
            }

            // If we have events, process them.
            if !events_batch.is_empty() {
                // --- 2. Transactional Backlink Updates (for renames) ---
                for event in &events_batch {
                    if let FileEvent::Renamed { from, to } = &event {
                        if let Some(writer) = writer.read().clone() {
                            // Get the backlinks from the index *before* it's updated.
                            let backlinks = {
                                let index = indexer.read();
                                index
                                    .pages
                                    .get(from)
                                    .map(|p| p.backlinks.clone())
                                    .unwrap_or_default()
                            };

                            if !backlinks.is_empty() {
                                info!(
                                    "External rename detected for file with {} backlinks. Updating...",
                                    backlinks.len()
                                );
                                if let Err(e) =
                                    writer.update_backlinks_for_rename(from, to, &backlinks)
                                {
                                    error!(
                                        "Failed to update backlinks for external rename from {:?} to {:?}: {}",
                                        from, to, e
                                    );
                                }
                            }
                        }
                    }
                }

                // --- 3. Batch Index Update ---
                {
                    let mut index = indexer.write();
                    index.handle_event_batch(&events_batch);
                }

                // --- 4. Notify Frontend ---
                if let Err(e) = app_handle.emit("index-updated", ()) {
                    error!("Failed to emit index-updated event: {}", e);
                }
            }
        }
        info!("File event processing task stopped");
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
        // This operation does not lock the renderer, only the indexer internally for link resolution.
        if let Some(renderer) = self.renderer.read().as_ref() {
            renderer.render_page_preview(content)
        } else {
            Err(ChroniclerError::VaultNotInitialized)
        }
    }

    /// Renders a string of pure Markdown to a `RenderedPage` object.
    /// This bypasses all wikilink and frontmatter processing.
    pub fn render_markdown(&self, markdown: &str) -> Result<RenderedPage> {
        // This is a pure function and doesn't require any state locks.
        if let Some(renderer) = self.renderer.read().as_ref() {
            renderer.render_markdown(markdown)
        } else {
            Err(ChroniclerError::VaultNotInitialized)
        }
    }

    /// Fetches and renders all data required for the main file view.
    pub fn build_page_view(&self, path: &str) -> Result<FullPageData> {
        // The renderer handles its own internal locking of the indexer.
        if let Some(renderer) = self.renderer.read().as_ref() {
            renderer.build_page_view(path)
        } else {
            Err(ChroniclerError::VaultNotInitialized)
        }
    }

    /// Returns a list of all directory paths in the vault.
    pub fn get_all_directory_paths(&self) -> Result<Vec<PathBuf>> {
        self.indexer.read().get_all_directory_paths()
    }

    /// Converts a relative or absolute image path to a Base64 Data URL string.
    pub fn get_image_as_base64(&self, path: &str) -> Result<String> {
        if let Some(renderer) = self.renderer.read().as_ref() {
            Ok(renderer.convert_image_path_to_data_url(path))
        } else {
            Err(ChroniclerError::VaultNotInitialized)
        }
    }

    /// Returns a list of all broken links in the vault.
    pub fn get_all_broken_links(&self) -> Result<Vec<BrokenLink>> {
        self.indexer.read().get_all_broken_links()
    }

    // --- Synchronous File System Operations (from UI) ---

    /// Writes content to a page on disk.
    /// This method doesn't need to modify the index directly, as the file watcher
    /// will detect the change and send an event.
    pub fn write_page_content(&self, path: &str, content: &str) -> Result<()> {
        let writer = self
            .writer
            .read()
            .clone()
            .ok_or(ChroniclerError::VaultNotInitialized)?;
        writer.write_page_content(Path::new(path), content)
    }

    /// Creates a new markdown file, optionally using a template.
    pub fn create_new_file(
        &self,
        parent_dir: String,
        file_name: String,
        template_path: Option<String>,
    ) -> Result<PageHeader> {
        let writer = self
            .writer
            .read()
            .clone()
            .ok_or(ChroniclerError::VaultNotInitialized)?;

        // Read the template content if a path is provided.
        let template_content = template_path
            .map(|p| template::read_template(Path::new(&p)))
            .transpose()?;

        let page_header = writer.create_new_file(&parent_dir, &file_name, template_content)?;

        // For UI actions, we call the synchronous indexer method to get immediate feedback.
        self.indexer
            .write()
            .handle_event_and_rebuild(&FileEvent::Created(page_header.path.clone()));

        Ok(page_header)
    }

    /// Creates a new, empty folder.
    pub fn create_new_folder(&self, parent_dir: String, folder_name: String) -> Result<()> {
        let writer = self
            .writer
            .read()
            .clone()
            .ok_or(ChroniclerError::VaultNotInitialized)?;

        let new_path = writer.create_new_folder(&parent_dir, &folder_name)?;

        self.indexer
            .write()
            .handle_event_and_rebuild(&FileEvent::FolderCreated(new_path));

        Ok(())
    }

    /// Renames a file or folder in-place and synchronously updates the index.
    pub fn rename_path(&self, path: PathBuf, new_name: String) -> Result<()> {
        let writer = self
            .writer
            .read()
            .clone()
            .ok_or(ChroniclerError::VaultNotInitialized)?;

        // Get necessary info from the indexer before performing the operation.
        let backlinks = {
            let index = self.indexer.read();
            index
                .pages
                .get(&path)
                .map(|p| p.backlinks.clone())
                .unwrap_or_default()
        };

        let new_path = writer.rename_path(&path, &new_name, &backlinks)?;

        // After the transaction succeeds, update the indexer's in-memory state.
        self.indexer
            .write()
            .handle_event_and_rebuild(&FileEvent::Renamed {
                from: path,
                to: new_path,
            });

        Ok(())
    }

    /// Moves a file or folder to a new directory, updating links and the index.
    pub fn move_path(&self, source_path: PathBuf, dest_dir: PathBuf) -> Result<()> {
        let writer = self
            .writer
            .read()
            .clone()
            .ok_or(ChroniclerError::VaultNotInitialized)?;

        // Get backlinks from the indexer *before* the move.
        let backlinks = {
            let index = self.indexer.read();
            index
                .pages
                .get(&source_path)
                .map(|p| p.backlinks.clone())
                .unwrap_or_default()
        };

        // The writer performs the transactional move on the file system.
        let new_path = writer.move_path(&source_path, &dest_dir, &backlinks)?;

        // After the move succeeds, notify the indexer of the rename event.
        self.indexer
            .write()
            .handle_event_and_rebuild(&FileEvent::Renamed {
                from: source_path,
                to: new_path,
            });

        Ok(())
    }

    /// Deletes a file or folder and synchronously updates the index.
    pub fn delete_path(&self, path: PathBuf) -> Result<()> {
        let writer = self
            .writer
            .read()
            .clone()
            .ok_or(ChroniclerError::VaultNotInitialized)?;

        writer.delete_path(&path)?;

        let event = if path.is_dir() {
            FileEvent::FolderDeleted(path)
        } else {
            FileEvent::Deleted(path)
        };
        self.indexer.write().handle_event_and_rebuild(&event);
        Ok(())
    }

    /// Duplicates a page and synchronously updates the index.
    pub fn duplicate_page(&self, path: String) -> Result<PageHeader> {
        let writer = self
            .writer
            .read()
            .clone()
            .ok_or(ChroniclerError::VaultNotInitialized)?;

        let new_page_header = writer.duplicate_page(&PathBuf::from(path))?;

        // After the file is created on disk, notify the indexer.
        self.indexer
            .write()
            .handle_event_and_rebuild(&FileEvent::Created(new_page_header.path.clone()));

        Ok(new_page_header)
    }

    // --- Document Import Operations ---

    /// Converts individual docx files and adds them to the vault, then updates the index.
    pub fn import_docx_files(
        &self,
        app_handle: &AppHandle,
        docx_paths: Vec<PathBuf>,
    ) -> Result<Vec<PathBuf>> {
        let output_dir = self
            .root_path
            .read()
            .clone()
            .ok_or(ChroniclerError::VaultNotInitialized)?;

        let converted_paths =
            importer::convert_docx_to_markdown(app_handle, docx_paths, output_dir)?;

        let mut indexer = self.indexer.write();
        for path in &converted_paths {
            indexer.update_file(path); // Update index state
        }
        indexer.rebuild_relations(); // Rebuild relations once

        Ok(converted_paths)
    }

    /// Scans a directory for .docx files, imports them, and updates the index.
    ///
    /// This method acts as a coordinator. It determines the output directory,
    /// delegates the scanning and conversion logic to the `importer` module,
    /// and then performs its primary responsibility: updating the application index
    /// with the newly created files.
    pub fn import_docx_from_folder(
        &self,
        app_handle: &AppHandle,
        folder_path: PathBuf,
    ) -> Result<Vec<PathBuf>> {
        // 1. Determine the output path (the root of the current vault).
        let output_dir = self
            .root_path
            .read()
            .clone()
            .ok_or(ChroniclerError::VaultNotInitialized)?;

        // 2. Delegate the file discovery and conversion process to the importer module.
        let converted_paths =
            importer::convert_docx_in_folder(app_handle, &folder_path, output_dir)?;

        // If the importer found no files, we can stop early.
        if converted_paths.is_empty() {
            return Ok(Vec::new());
        }

        // 3. The World's responsibility is to update the index after the import.
        let mut indexer = self.indexer.write();
        for path in &converted_paths {
            indexer.update_file(path); // Update index state
        }
        indexer.rebuild_relations(); // Rebuild relations once

        Ok(converted_paths)
    }
}

/// Provides a default, empty `World` instance.
///
/// This implementation allows for the creation of a `World` using `World::default()`.
impl Default for World {
    fn default() -> Self {
        Self::new()
    }
}
