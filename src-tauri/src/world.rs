//! Central application state manager.
//!
//! Coordinates the indexer, watcher, and frontend communication.

use crate::{
    error::Result,
    indexer::Indexer,
    models::{FileNode, PageHeader},
    watcher::Watcher,
};
use parking_lot::{Mutex, RwLock};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio::sync::broadcast;
use tracing::instrument;

/// The main `World` struct containing all application subsystems and state.
///
/// This struct acts as the single source of truth for the backend. It is wrapped in a `tauri::State`
/// managed `Mutex` in `main.rs`, ensuring that all access to it from frontend commands is sequential
/// and safe.
///
/// # Fields
/// * `root_path`: The root directory of the worldbuilding vault.
/// * `indexer`: Thread-safe, shared access to the vault indexer. An `Arc<RwLock<>>` is used
///   so the indexer can be safely accessed by both the `World`'s methods (readers) and the event
///   processing task (writer) that runs in the background.
/// * `watcher`: The application's file system watcher.
#[derive(Debug)]
pub struct World {
    root_path: PathBuf,
    indexer: Arc<RwLock<Indexer>>,
    watcher: Mutex<Watcher>,
}

impl World {
    /// Creates a new `World` instance.
    ///
    /// This initializes the `Indexer` and `Watcher` but does not perform any scans or start
    /// the watcher. The `initialize` method should be called for that.
    ///
    /// # Arguments
    /// * `root_path` - Path to the root directory of the worldbuilding vault.
    pub fn new(root_path: &Path) -> Self {
        Self {
            root_path: root_path.to_path_buf(),
            indexer: Arc::new(RwLock::new(Indexer::new(root_path))),
            watcher: parking_lot::Mutex::new(Watcher::new()),
        }
    }

    /// Initializes the world by performing a full scan of the vault directory and starting
    /// the file watcher with event processing. This should be called once during application startup.
    ///
    /// # Arguments
    /// * `_app_handle` - A handle to the Tauri application (unused in current implementation but
    ///   kept for future frontend event emission)
    #[instrument(level = "debug", skip(self))]
    pub fn initialize(&self) -> Result<()> {
        // --- 1. Perform Initial Scan ---
        // Lock the indexer to perform the initial, potentially long-running, full scan.
        {
            let mut indexer = self.indexer.write();
            indexer.full_scan(&self.root_path)?;
        }

        // --- 2. Start File Watcher ---
        let mut watcher = self.watcher.lock();
        watcher.start(&self.root_path)?;

        // --- 3. Subscribe to File Events ---
        let event_receiver = watcher.subscribe();

        // --- 4. Spawn Background Event Processing Task ---
        let indexer_clone = self.indexer.clone();
        // Use Tauri's async runtime instead of tokio::spawn
        tauri::async_runtime::spawn(async move {
            Self::process_file_events(indexer_clone, event_receiver).await;
        });

        Ok(())
    }

    /// Background task that processes file events and updates the indexer.
    ///
    /// This runs in a separate async task and handles the event loop for file changes.
    /// It continues until the event channel is closed or an unrecoverable error occurs.
    ///
    /// # Arguments
    /// * `indexer` - Shared reference to the indexer
    /// * `mut event_receiver` - Receiver for file change events
    #[instrument(level = "debug", skip(indexer, event_receiver))]
    async fn process_file_events(
        indexer: Arc<RwLock<Indexer>>,
        mut event_receiver: broadcast::Receiver<crate::events::FileEvent>,
    ) {
        loop {
            match event_receiver.recv().await {
                Ok(event) => {
                    let mut indexer = indexer.write();
                    indexer.handle_file_event(&event);
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

    /// Returns a lightweight list of all indexed pages (title and path).
    pub fn get_all_pages(&self) -> Result<Vec<PageHeader>> {
        let indexer = self.indexer.read();
        indexer.get_all_pages()
    }

    /// Returns all tags and the pages that reference them.
    pub fn get_all_tags(&self) -> Result<HashMap<String, Vec<PathBuf>>> {
        let indexer = self.indexer.read();
        indexer.get_all_tags()
    }

    /// Returns the file tree structure of the vault for frontend display.
    pub fn get_file_tree(&self) -> Result<FileNode> {
        let indexer = self.indexer.read();
        indexer.get_file_tree()
    }

    /// Manually triggers an index update for a single file.
    pub fn update_file(&self, path: &Path) -> Result<()> {
        let mut indexer = self.indexer.write();
        indexer.update_file(path);
        Ok(())
    }
}
