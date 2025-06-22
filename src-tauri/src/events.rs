//! Event system for the worldbuilding application.
//!
//! This module defines the events that flow through the application when files change,
//! providing a decoupled architecture where the watcher publishes events and multiple
//! subscribers (like the indexer) can react to them.

use std::path::PathBuf;

/// Represents different types of file system events that can occur in the vault.
///
/// These events are published by the file watcher and consumed by various subsystems
/// like the indexer, backup system, or validation components.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileEvent {
    /// A new file was created in the vault.
    Created(PathBuf),

    /// An existing file was modified (content changed).
    Modified(PathBuf),

    /// A file was deleted from the vault.
    Deleted(PathBuf),

    /// A file was renamed or moved within the vault.
    Renamed { from: PathBuf, to: PathBuf },
}

impl FileEvent {
    /// Returns the primary path associated with this event.
    /// For rename events, this returns the destination path.
    pub fn path(&self) -> &PathBuf {
        match self {
            FileEvent::Created(path) => path,
            FileEvent::Modified(path) => path,
            FileEvent::Deleted(path) => path,
            FileEvent::Renamed { to, .. } => to,
        }
    }

    /// Returns a human-readable description of the event type.
    pub fn event_type(&self) -> &'static str {
        match self {
            FileEvent::Created(_) => "created",
            FileEvent::Modified(_) => "modified",
            FileEvent::Deleted(_) => "deleted",
            FileEvent::Renamed { .. } => "renamed",
        }
    }
}
