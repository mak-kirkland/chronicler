//! File system watcher that publishes events to a broadcast channel.
//!
//! This module handles filesystem watching with debouncing and publishes standardized
//! `FileEvent`s to a broadcast channel. Multiple subscribers can listen to these events
//! and react accordingly (indexing, backup, validation, etc.).

use crate::{
    config::{DEBOUNCE_INTERVAL, DEFAULT_EVENT_CHANNEL_CAPACITY},
    error::Result,
    events::FileEvent,
    utils::{is_image_file, is_map_file, is_markdown_file, is_under_hidden_subdir},
};
use notify_debouncer_full::{
    new_debouncer,
    notify::{
        event::{ModifyKind, RemoveKind, RenameMode},
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
    /// Constructs an idle watcher. Call `start()` before it produces events.
    pub fn new() -> Self {
        let (event_sender, _) = broadcast::channel(DEFAULT_EVENT_CHANNEL_CAPACITY);
        Self {
            debouncer: None,
            event_sender,
        }
    }

    /// Begins recursively watching `root_path` and forwarding debounced
    /// events to all current and future subscribers.
    #[instrument(level = "debug", skip(self))]
    pub fn start(&mut self, root_path: &Path) -> Result<()> {
        // Captured into the callback so events under hidden subdirs (our
        // own `.chronicler-cache/`, `.git/`, …) can be filtered out.
        let event_sender = self.event_sender.clone();
        let root = root_path.to_path_buf();

        // Create the debouncer with our event publishing callback
        let mut debouncer = new_debouncer(
            DEBOUNCE_INTERVAL,
            None,
            move |result: DebounceEventResult| match result {
                Ok(events) => publish(&event_sender, &root, events),
                Err(errors) => {
                    for err in errors {
                        error!("File watcher error: {:?}", err);
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

    /// Returns a fresh receiver for file events. Slow consumers that fall
    /// behind the channel capacity will see `RecvError::Lagged` and miss
    /// events; callers should resync from the indexer in that case.
    pub fn subscribe(&self) -> broadcast::Receiver<FileEvent> {
        self.event_sender.subscribe()
    }
}

impl Drop for Watcher {
    /// Stops the watcher thread and closes the broadcast channel — pending
    /// receivers will see `RecvError::Closed` on their next recv.
    fn drop(&mut self) {
        if self.debouncer.is_some() {
            info!("Shutting down file watcher and closing event channel");
            // The debouncer's Drop implementation handles thread cleanup
        }
    }
}

/// Translates each raw debounced event and broadcasts the resulting
/// `FileEvent`s. Markdown, image, and map files are tracked; temp files
/// (`.#foo.md`) and hidden subdirs of the vault are ignored.
#[instrument(level = "debug", skip(sender, vault_root, events))]
fn publish(sender: &broadcast::Sender<FileEvent>, vault_root: &Path, events: Vec<DebouncedEvent>) {
    for event in events {
        for fe in translate(&event, vault_root) {
            info!(
                "Publishing file event: {} - {:?}",
                fe.event_type(),
                fe.path()
            );
            let _ = sender.send(fe);
        }
    }
}

/// Translate a single raw debounced event into our `FileEvent`s.
///
/// Each cross-platform event variant maps onto one of four buckets:
/// "appeared", "disappeared", "modified", or "renamed". Path filtering
/// (hidden subdirs, temp files, untracked extensions) is handled by the
/// classifier helpers below.
fn translate(event: &DebouncedEvent, vault_root: &Path) -> Vec<FileEvent> {
    use ModifyKind::{Any as ModifyAny, Data, Name};

    match &event.kind {
        // Path now exists on disk. Covers every Create variant plus
        // Linux's `IN_MOVED_TO` (and the equivalent on Windows when the
        // source was outside the watched tree).
        EventKind::Create(_) | EventKind::Modify(Name(RenameMode::To)) => event
            .paths
            .iter()
            .filter_map(|p| classify_appearance(p, vault_root))
            .collect(),

        // OS told us precisely what was removed — preserve that.
        EventKind::Remove(RemoveKind::File) => event
            .paths
            .iter()
            .filter(|p| is_tracked_file(p, vault_root))
            .map(|p| FileEvent::Deleted(p.clone()))
            .collect(),
        EventKind::Remove(RemoveKind::Folder) => event
            .paths
            .iter()
            .filter(|p| !is_ignored(p, vault_root))
            .map(|p| FileEvent::FolderDeleted(p.clone()))
            .collect(),

        // Path is gone and the OS didn't tell us what it was. Covers
        // Windows' `FILE_ACTION_REMOVED` and rename-out events.
        EventKind::Remove(_) | EventKind::Modify(Name(RenameMode::From)) => event
            .paths
            .iter()
            .filter_map(|p| classify_disappearance(p, vault_root))
            .collect(),

        EventKind::Modify(Data(_)) | EventKind::Modify(ModifyAny) => event
            .paths
            .iter()
            .filter(|p| is_tracked_file(p, vault_root))
            .map(|p| FileEvent::Modified(p.clone()))
            .collect(),

        EventKind::Modify(Name(RenameMode::Both)) => translate_rename(&event.paths, vault_root),

        // RenameMode::Any is left alone — platforms that emit it also emit
        // a separate Create/Remove, so handling it here would double-fire.
        _ => Vec::new(),
    }
}

fn translate_rename(paths: &[PathBuf], vault_root: &Path) -> Vec<FileEvent> {
    let [from, to] = paths else { return Vec::new() };
    let valid = is_tracked_file(from, vault_root)
        || is_tracked_file(to, vault_root)
        || (to.is_dir() && !is_under_hidden_subdir(to, vault_root));
    if valid {
        vec![FileEvent::Renamed {
            from: from.clone(),
            to: to.clone(),
        }]
    } else {
        Vec::new()
    }
}

/// Path exists on disk; `is_dir()` is authoritative.
fn classify_appearance(path: &Path, vault_root: &Path) -> Option<FileEvent> {
    if is_ignored(path, vault_root) {
        None
    } else if path.is_dir() {
        Some(FileEvent::FolderCreated(path.to_path_buf()))
    } else if has_tracked_extension(path) {
        Some(FileEvent::Created(path.to_path_buf()))
    } else {
        None
    }
}

/// Path is gone; guess folder vs file from the extension.
fn classify_disappearance(path: &Path, vault_root: &Path) -> Option<FileEvent> {
    if is_ignored(path, vault_root) {
        None
    } else if has_tracked_extension(path) {
        Some(FileEvent::Deleted(path.to_path_buf()))
    } else {
        Some(FileEvent::FolderDeleted(path.to_path_buf()))
    }
}

fn is_tracked_file(path: &Path, vault_root: &Path) -> bool {
    !is_ignored(path, vault_root) && has_tracked_extension(path)
}

fn is_ignored(path: &Path, vault_root: &Path) -> bool {
    is_temp_file(path) || is_under_hidden_subdir(path, vault_root)
}

fn has_tracked_extension(path: &Path) -> bool {
    is_markdown_file(path) || is_image_file(path) || is_map_file(path)
}

/// Checks if a path points to a temporary/lock file (like .#file.md).
fn is_temp_file(path: &Path) -> bool {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .is_some_and(|s| s.starts_with(".#"))
}
