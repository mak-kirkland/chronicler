//! Filesystem management with pure event-driven indexing

use crate::{
    error::{AppError, Result},
    markdown::parse_markdown,
};
use notify::{event::ModifyKind, Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::hash::Hasher;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{channel, Receiver, Sender},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use twox_hash::XxHash64;
use walkdir::WalkDir;

/// Structure representing file metadata for indexing
#[derive(Debug, Clone)]
pub struct FileIndex {
    /// Content hash for change detection
    pub content_hash: u64,
    /// Tags found in the file
    pub tags: HashSet<String>,
}

/// Structure representing the world index
#[derive(Debug, Default)]
pub struct WorldIndex {
    /// Mapping from tag to set of file paths
    pub tags: HashMap<String, HashSet<PathBuf>>,
    /// Mapping from file path to files that link to it
    pub backlinks: HashMap<PathBuf, HashSet<PathBuf>>,
    /// Metadata for each indexed file
    pub file_data: HashMap<PathBuf, FileIndex>,
}

/// Filesystem manager with indexing capabilities
pub struct FsManager {
    /// Root directory of the world
    pub world_root: PathBuf,
    /// In-memory index
    pub index: Arc<Mutex<WorldIndex>>,
    /// Channel for receiving filesystem events
    event_rx: Receiver<Event>,
    /// Flag to stop the watcher thread
    stop_watcher: Arc<AtomicBool>,
    /// Handle to the watcher thread
    watcher_thread: Option<thread::JoinHandle<()>>,
}

impl FsManager {
    /// Creates a new filesystem manager
    pub fn new(world_root: PathBuf) -> Result<Self> {
        let (event_tx, event_rx) = channel();
        let stop_watcher = Arc::new(AtomicBool::new(false));
        let index = Arc::new(Mutex::new(WorldIndex::default()));

        // Start watcher thread
        let watcher_thread =
            start_watcher_thread(world_root.clone(), event_tx, stop_watcher.clone())?;

        let mut manager = Self {
            world_root,
            index,
            event_rx,
            stop_watcher,
            watcher_thread: Some(watcher_thread),
        };

        // Build initial index in main thread
        manager.build_index()?;

        Ok(manager)
    }

    /// Builds the initial filesystem index
    pub fn build_index(&mut self) -> Result<()> {
        {
            let mut index = self.index.lock().unwrap();
            *index = WorldIndex::default(); // drop lock immediately after
        }

        for entry in WalkDir::new(&self.world_root)
            .min_depth(1)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter(|e| is_markdown_file(e.path()))
        {
            let rel_path = path_relative_to(entry.path(), &self.world_root)?;
            self.update_file_index(rel_path)?;
        }

        log::info!(
            "Built initial index with {} files",
            self.index.lock().unwrap().file_data.len()
        );

        Ok(())
    }

    /// Checks for filesystem changes and updates index
    pub fn check_for_changes(&mut self) -> Result<()> {
        while let Ok(event) = self.event_rx.try_recv() {
            if is_relevant_event(&event) {
                log::debug!("Processing filesystem event: {:?}", event);
                self.handle_event(event)?;
            }
        }
        Ok(())
    }

    /// Handles a filesystem event
    fn handle_event(&mut self, event: Event) -> Result<()> {
        match event.kind {
            notify::EventKind::Modify(ModifyKind::Name(notify::event::RenameMode::Both)) => {
                if event.paths.len() == 2 {
                    let old_path = path_relative_to(&event.paths[0], &self.world_root)?;
                    let new_path = path_relative_to(&event.paths[1], &self.world_root)?;
                    self.handle_rename(&old_path, &new_path)?;
                }
            }
            _ => {
                for path in event.paths {
                    if let Ok(rel_path) = path_relative_to(&path, &self.world_root) {
                        if is_markdown_file(&path) {
                            match event.kind {
                                notify::EventKind::Remove(_) => {
                                    self.remove_file(&rel_path)?;
                                }
                                _ => {
                                    self.update_file_index(rel_path)?;
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }

    /// Updates index for a single file
    pub fn update_file_index(&mut self, file_path: PathBuf) -> Result<()> {
        let abs_path = self.world_root.join(&file_path);

        // Read file content
        let content = match fs::read_to_string(&abs_path) {
            Ok(c) => c,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // File was deleted
                self.remove_file(&file_path)?;
                return Ok(());
            }
            Err(e) => return Err(e.into()),
        };

        // Calculate content hash
        let mut hasher = XxHash64::default();
        hasher.write(content.as_bytes());
        let content_hash = hasher.finish();

        // Get index lock
        let mut index = self.index.lock().unwrap();

        // Check if unchanged
        if let Some(existing) = index.file_data.get(&file_path) {
            if existing.content_hash == content_hash {
                return Ok(());
            }
        }

        // Parse markdown
        let parsed = parse_markdown(&content)?;

        // Resolve wikilinks
        let mut resolved_links = HashSet::new();
        for link in &parsed.wikilinks {
            if let Ok(resolved) = self.resolve_wikilink(&file_path, link) {
                resolved_links.insert(resolved);
            }
        }

        // Remove old references
        self.remove_file_references(&mut index, &file_path);

        // Add new references
        let new_index = FileIndex {
            content_hash,
            tags: parsed.tags.iter().cloned().collect(),
        };

        // Update tags index
        for tag in &new_index.tags {
            index
                .tags
                .entry(tag.clone())
                .or_default()
                .insert(file_path.clone());
        }

        // Update backlinks index
        for link_path in &resolved_links {
            index
                .backlinks
                .entry(link_path.clone())
                .or_default()
                .insert(file_path.clone());
        }

        // Store file metadata
        index.file_data.insert(file_path.clone(), new_index);

        log::info!("Index updated: {}", file_path.display());
        Ok(())
    }

    /// Removes a file from the index
    fn remove_file(&mut self, file_path: &Path) -> Result<()> {
        let mut index = self.index.lock().unwrap();
        self.remove_file_references(&mut index, file_path);
        index.file_data.remove(file_path);
        log::info!("Removed from index: {}", file_path.display());
        Ok(())
    }

    /// Handles file rename
    fn handle_rename(&mut self, old_path: &Path, new_path: &Path) -> Result<()> {
        if old_path == new_path {
            return Ok(());
        }

        let mut index = self.index.lock().unwrap();

        // Update file metadata
        if let Some(file_index) = index.file_data.remove(old_path) {
            index.file_data.insert(new_path.to_path_buf(), file_index);
        }

        // Update tags index
        for files in index.tags.values_mut() {
            if files.remove(old_path) {
                files.insert(new_path.to_path_buf());
            }
        }

        // Update backlinks index
        for files in index.backlinks.values_mut() {
            if files.remove(old_path) {
                files.insert(new_path.to_path_buf());
            }
        }

        // Update backlinks pointing to this file
        if let Some(backlinks) = index.backlinks.remove(old_path) {
            index.backlinks.insert(new_path.to_path_buf(), backlinks);
        }

        log::info!("Renamed: {} → {}", old_path.display(), new_path.display());
        Ok(())
    }

    /// Removes all references to a file
    fn remove_file_references(&self, index: &mut WorldIndex, file_path: &Path) {
        // Remove from tags index
        if let Some(file_index) = index.file_data.get(file_path) {
            for tag in &file_index.tags {
                if let Some(files) = index.tags.get_mut(tag) {
                    files.remove(file_path);
                }
            }
        }

        // Remove from backlinks index
        for (_, referrers) in index.backlinks.iter_mut() {
            referrers.remove(file_path);
        }
    }

    /// Resolves a wikilink relative to current file
    pub fn resolve_wikilink(&self, current_path: &Path, link: &str) -> Result<PathBuf> {
        // Normalize link (convert to lowercase and replace spaces)
        let normalized_link = link.to_lowercase().replace(' ', "_");

        // Try direct path
        let abs_path = self.world_root.join(&normalized_link);
        if abs_path.is_file() {
            return path_relative_to(&abs_path, &self.world_root);
        }

        // Try with .md extension
        let with_ext = abs_path.with_extension("md");
        if with_ext.is_file() {
            return path_relative_to(&with_ext, &self.world_root);
        }

        // Try relative to current directory
        if let Some(parent) = current_path.parent() {
            let rel_path = parent.join(&normalized_link);
            let abs_path = self.world_root.join(&rel_path);

            if abs_path.is_file() {
                return Ok(rel_path);
            }

            // Try with .md extension
            let with_ext = abs_path.with_extension("md");
            if with_ext.is_file() {
                return path_relative_to(&with_ext, &self.world_root);
            }
        }

        // Try case-insensitive search
        if let Some(found) = self.find_file_case_insensitive(&normalized_link) {
            return Ok(found);
        }

        Err(AppError::Wikilink(format!(
            "Could not resolve '{}' from '{}'",
            link,
            current_path.display()
        )))
    }

    /// Case-insensitive file search
    fn find_file_case_insensitive(&self, base_name: &str) -> Option<PathBuf> {
        let base_name_lower = base_name.to_lowercase();
        let index = self.index.lock().unwrap();

        index.file_data.keys().find_map(|path| {
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_lowercase())?;

            if stem == base_name_lower {
                Some(path.clone())
            } else {
                None
            }
        })
    }

    /// Gets files with a specific tag
    pub fn get_tag_files(&self, tag: &str) -> Vec<PathBuf> {
        let index = self.index.lock().unwrap();
        index
            .tags
            .get(tag)
            .map(|set| set.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Gets backlinks for a file
    pub fn get_backlinks(&self, path: &Path) -> Vec<PathBuf> {
        let index = self.index.lock().unwrap();
        index
            .backlinks
            .get(path)
            .map(|set| set.iter().cloned().collect())
            .unwrap_or_default()
    }
}

impl Drop for FsManager {
    fn drop(&mut self) {
        self.stop_watcher.store(true, Ordering::Relaxed);

        // Give thread time to cleanup
        if let Some(handle) = self.watcher_thread.take() {
            let _: () = handle.join().unwrap_or_else(|_| {
                log::warn!("Watcher thread didn't exit cleanly");
            });
        }
    }
}

/// Starts the filesystem watcher in a background thread
fn start_watcher_thread(
    world_root: PathBuf,
    event_tx: Sender<Event>,
    stop_flag: Arc<AtomicBool>,
) -> Result<thread::JoinHandle<()>> {
    let (notify_tx, notify_rx) = channel();
    let mut watcher: RecommendedWatcher = Watcher::new(
        notify_tx,
        Config::default()
            .with_poll_interval(Duration::from_secs(1))
            .with_compare_contents(true),
    )?;

    watcher.watch(&world_root, RecursiveMode::Recursive)?;

    let handle = thread::spawn(move || {
        while !stop_flag.load(Ordering::Relaxed) {
            match notify_rx.recv_timeout(Duration::from_millis(100)) {
                Ok(res) => match res {
                    Ok(event) => {
                        // Filter relevant events
                        if is_relevant_event(&event) {
                            // Send to main thread for processing
                            if event_tx.send(event).is_err() {
                                break; // Main thread disconnected
                            }
                        }
                    }
                    Err(e) => log::error!("Watcher error: {}", e),
                },
                Err(_) => continue, // Timeout, check stop flag
            }
        }
        log::info!("Watcher thread exiting");
    });

    Ok(handle)
}

/// Checks if a path is a markdown file
fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .map(|ext| ext == "md" || ext == "markdown")
        .unwrap_or(false)
}

/// Gets path relative to base directory
fn path_relative_to(path: &Path, base: &Path) -> Result<PathBuf> {
    path.strip_prefix(base)
        .map(|p| p.to_path_buf())
        .map_err(|_| {
            AppError::Path(format!(
                "Path '{}' is not in base directory '{}'",
                path.display(),
                base.display()
            ))
        })
}

/// Checks if a filesystem event is relevant for indexing
fn is_relevant_event(event: &Event) -> bool {
    matches!(
        event.kind,
        notify::EventKind::Create(_)
            | notify::EventKind::Modify(
                ModifyKind::Data(_) | ModifyKind::Name(_) | ModifyKind::Metadata(_)
            )
            | notify::EventKind::Remove(_)
    )
}
