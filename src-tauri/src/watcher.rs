//! File system watcher that publishes events to a broadcast channel.
//!
//! This module handles filesystem watching with debouncing and publishes standardized
//! `FileEvent`s to a broadcast channel. Multiple subscribers can listen to these events
//! and react accordingly (indexing, backup, validation, etc.).

use crate::{
    config::{DEBOUNCE_INTERVAL, DEFAULT_EVENT_CHANNEL_CAPACITY},
    error::Result,
    events::FileEvent,
    utils::{is_image_file, is_markdown_file},
};
use notify_debouncer_full::{
    new_debouncer,
    notify::{
        event::{CreateKind, ModifyKind, RemoveKind, RenameMode},
        EventKind, RecommendedWatcher, RecursiveMode,
    },
    DebounceEventResult, DebouncedEvent, Debouncer, FileIdMap,
};
use std::path::{Path, PathBuf};
use tokio::sync::broadcast;
use tracing::{error, info, instrument};

/// Manages the application's file system watcher and event broadcasting.
///
/// The watcher observes file system changes and publishes `FileEvent`s to a broadcast
/// channel. This allows multiple subscribers to react to file changes independently.
///
/// # Lifecycle
/// - Create with `new()`
/// - Start watching with `start()`
/// - Get event receiver with `subscribe()`
/// - Automatic cleanup when dropped
#[derive(Debug)]
pub struct Watcher {
    /// The debouncer instance that handles filesystem events.
    /// When this is dropped, the watcher thread stops automatically.
    debouncer: Option<Debouncer<RecommendedWatcher, FileIdMap>>,

    /// Broadcast sender for publishing file events.
    /// Multiple subscribers can receive these events independently.
    event_sender: broadcast::Sender<FileEvent>,
}

impl Watcher {
    /// Creates a new file watcher with event broadcasting capability.
    ///
    /// # Returns
    /// A new `Watcher` instance ready to start monitoring file changes.
    /// The watcher is not active until `start()` is called.
    pub fn new() -> Self {
        let (event_sender, _) = broadcast::channel(DEFAULT_EVENT_CHANNEL_CAPACITY);

        Self {
            debouncer: None,
            event_sender,
        }
    }

    /// Starts the filesystem watcher for the specified path.
    ///
    /// This method initializes the debouncer with a callback that publishes events
    /// to the broadcast channel. The watcher will recursively monitor all changes
    /// within the specified directory.
    ///
    /// # Arguments
    /// * `root_path` - The root directory to watch for changes
    ///
    /// # Returns
    /// `Result<()>` indicating success or failure to start the watcher
    ///
    /// # Errors
    /// Returns an error if:
    /// - The debouncer cannot be created
    /// - The filesystem watcher cannot be started
    /// - The root path is invalid or inaccessible
    #[instrument(level = "debug", skip(self))]
    pub fn start(&mut self, root_path: &Path) -> Result<()> {
        // Clone the sender for use in the callback closure
        let event_sender = self.event_sender.clone();

        // Create the debouncer with our event publishing callback
        let mut debouncer = new_debouncer(
            DEBOUNCE_INTERVAL,
            None,
            move |result: DebounceEventResult| match result {
                Ok(events) => {
                    handle_debounced_events(&event_sender, events);
                }
                Err(errors) => {
                    for error in errors {
                        error!("File watcher error: {:?}", error);
                    }
                }
            },
        )?;

        // Start watching the root path recursively
        notify::Watcher::watch(debouncer.watcher(), root_path, RecursiveMode::Recursive)?;

        // Store the debouncer to keep the watcher alive
        self.debouncer = Some(debouncer);
        Ok(())
    }

    /// Creates a new subscriber to file events.
    ///
    /// Each subscriber gets their own receiver that can independently process
    /// file events. Subscribers will receive all events published after they
    /// subscribe, but may miss events if their processing is too slow.
    ///
    /// # Returns
    /// A `broadcast::Receiver<FileEvent>` that receives all file change events
    ///
    /// # Note
    /// If a subscriber falls behind and the channel buffer fills up, older
    /// events will be dropped and the subscriber will receive a `RecvError::Lagged`
    /// error when trying to receive.
    pub fn subscribe(&self) -> broadcast::Receiver<FileEvent> {
        self.event_sender.subscribe()
    }
}

impl Drop for Watcher {
    /// Cleanup when the watcher is dropped.
    ///
    /// The debouncer will automatically stop its thread and clean up resources.
    /// The broadcast channel will be closed, causing all subscribers to receive
    /// a `RecvError::Closed` when they next try to receive.
    #[instrument(level = "debug")]
    fn drop(&mut self) {
        if self.debouncer.is_some() {
            info!("Shutting down file watcher and closing event channel");
            // The debouncer's Drop implementation handles thread cleanup
        }
    }
}

/// Handles debounced filesystem events and publishes them to the event channel.
///
/// This function processes raw filesystem events from the debouncer, converts them
/// to our standardized `FileEvent` format, and publishes them to subscribers.
/// It processes both markdown and image files, ignoring temporary files.
///
/// # Arguments
/// * `event_sender` - The broadcast sender to publish events to
/// * `events` - Raw debounced events from the filesystem watcher
#[instrument(level = "debug", skip(event_sender, events))]
fn handle_debounced_events(
    event_sender: &broadcast::Sender<FileEvent>,
    events: Vec<DebouncedEvent>,
) {
    for event in events {
        // A closure to contain the heuristic for resolving ambiguous removals.
        let resolve_ambiguous_removal = |paths: &[PathBuf]| {
            paths
                .iter()
                .filter(|path| !is_temp_file(path))
                .map(|path| {
                    // This is an educated guess. If a path doesn't have an extension
                    // that we track, we'll assume it was a folder.
                    if !is_markdown_file(path) && !is_image_file(path) {
                        FileEvent::FolderDeleted(path.to_path_buf())
                    } else {
                        FileEvent::Deleted(path.to_path_buf())
                    }
                })
                .collect::<Vec<_>>()
        };

        // Convert raw filesystem events to our FileEvent enum
        let file_events: Vec<FileEvent> = match event.kind {
            EventKind::Create(CreateKind::File) => event
                .paths
                .iter()
                .filter(|path| is_valid_file(path))
                .map(|path| FileEvent::Created(path.clone()))
                .collect::<Vec<_>>(),

            EventKind::Create(CreateKind::Folder) => event
                .paths
                .iter()
                .map(|path| FileEvent::FolderCreated(path.clone()))
                .collect::<Vec<_>>(),

            EventKind::Modify(ModifyKind::Data(_)) | EventKind::Modify(ModifyKind::Any) => event
                .paths
                .iter()
                .filter(|path| is_valid_file(path))
                .map(|path| FileEvent::Modified(path.clone()))
                .collect::<Vec<_>>(),

            EventKind::Remove(RemoveKind::File) => event
                .paths
                .iter()
                .filter(|path| is_valid_file(path))
                .map(|path| FileEvent::Deleted(path.clone()))
                .collect::<Vec<_>>(),

            EventKind::Remove(RemoveKind::Folder) => event
                .paths
                .iter()
                .map(|path| FileEvent::FolderDeleted(path.clone()))
                .collect::<Vec<_>>(),

            // This handles ambiguous "delete" events, common on Windows.
            EventKind::Remove(RemoveKind::Any) => resolve_ambiguous_removal(&event.paths),

            EventKind::Modify(ModifyKind::Name(rename_mode)) => match rename_mode {
                // This is a true rename within the watched directory
                RenameMode::Both => {
                    // Check if either the source or destination is a valid file we track
                    if event.paths.len() == 2
                        && (is_valid_file(&event.paths[0]) || is_valid_file(&event.paths[1]))
                    {
                        vec![FileEvent::Renamed {
                            from: event.paths[0].clone(),
                            to: event.paths[1].clone(),
                        }]
                    } else {
                        Vec::new()
                    }
                }

                // This is a move OUT of the watched folder, which we treat as a deletion
                RenameMode::From => resolve_ambiguous_removal(&event.paths),

                // We can ignore RenameMode::To (moved into folder) and RenameMode::Any,
                // as Create events will handle the discovery of new files.
                _ => Vec::new(),
            },

            _ => Vec::new(), // Ignore other event types
        };

        // Publish each file event to subscribers
        for file_event in file_events {
            info!(
                "Publishing file event: {} - {:?}",
                file_event.event_type(),
                file_event.path()
            );

            // Publish the event to all subscribers
            // We don't check the result because it's normal for there to be no subscribers
            // or for some subscribers to have disconnected
            let _ = event_sender.send(file_event);
        }
    }
}

/// Checks if a path points to a valid file that should be processed.
/// This ignores temporary/lock files (like .#file.md).
fn is_valid_file(path: &Path) -> bool {
    !is_temp_file(path) && (is_markdown_file(path) || is_image_file(path))
}

/// Checks if a path points to a temporary/lock file (like .#file.md).
fn is_temp_file(path: &Path) -> bool {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .is_some_and(|s| s.starts_with(".#"))
}
