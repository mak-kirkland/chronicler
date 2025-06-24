/// Structure for tracking file change debouncing
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

#[derive(Debug)]
pub struct DebounceTracker {
    /// Maps file paths to their last change time
    last_change: HashMap<PathBuf, Instant>,
    /// How long to wait after last change before processing
    delay: Duration,
}

impl DebounceTracker {
    pub fn new(delay: Duration) -> Self {
        Self {
            last_change: HashMap::new(),
            delay,
        }
    }

    /// Records a change for a file path
    pub fn record_change(&mut self, path: PathBuf) {
        self.last_change.insert(path, Instant::now());
    }

    /// Gets all files that are ready to be processed (past debounce delay)
    pub fn get_ready_files(&mut self) -> Vec<PathBuf> {
        let now = Instant::now();
        let mut ready_files = Vec::new();

        // Find files that haven't changed recently
        self.last_change.retain(|path, &mut last_time| {
            if now.duration_since(last_time) >= self.delay {
                ready_files.push(path.clone());
                false // Remove from tracking
            } else {
                true // Keep tracking
            }
        });

        ready_files
    }

    /// Clears tracking for a specific file (useful for deletions)
    pub fn clear_file(&mut self, path: &Path) {
        self.last_change.remove(path);
    }
}
