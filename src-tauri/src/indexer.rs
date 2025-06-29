//! File indexer that registers page relationships.
//!
//! Event-driven indexer that maintains an in-memory index of all pages and tags.
//! The indexer processes individual file events but doesn't manage its own subscriptions.

use crate::{
    error::{ChroniclerError, Result},
    events::FileEvent,
    models::{FileNode, Link, Page},
    parser,
    utils::is_markdown_file,
};
use log::{debug, info, warn};
use std::{
    collections::{HashMap, HashSet},
    fs, mem,
    path::{Path, PathBuf},
    time::Instant,
};
use walkdir::WalkDir;

/// The main Indexer struct holds the entire knowledge base of the vault.
///
/// This indexer processes individual file events but doesn't manage async event loops
/// or subscriptions - that responsibility belongs to the World struct.
#[derive(Debug, Clone, Default)]
pub struct Indexer {
    pub root_path: Option<PathBuf>,
    pub pages: HashMap<PathBuf, Page>,
    pub tags: HashMap<String, HashSet<PathBuf>>,

    /// Fast lookup for resolving a normalized link name (String) to a file path.
    pub link_resolver: HashMap<String, PathBuf>,

    /// Stores the complete link graph: Source Path -> Target Path -> Vec<Link>.
    /// The Vec<Link> captures every link instance, to calculate link strength.
    pub link_graph: HashMap<PathBuf, HashMap<PathBuf, Vec<Link>>>,
}

impl Indexer {
    /// Creates a new indexer for the specified root path.
    ///
    /// # Arguments
    /// * `root_path` - The root directory of the vault to index
    pub fn new(root_path: &Path) -> Self {
        Self {
            root_path: Some(root_path.to_path_buf()),
            ..Self::default()
        }
    }

    /// Performs a complete scan of the vault directory to build the initial index.
    ///
    /// This is typically called once during application startup before starting
    /// the event-driven updates. After this completes, the indexer will maintain
    /// its state through file change events.
    ///
    /// # Arguments
    /// * `root_path` - The root directory to scan
    ///
    /// # Returns
    /// `Result<()>` indicating success or failure of the scan operation
    pub fn full_scan(&mut self, root_path: &Path) -> Result<()> {
        info!("Starting full scan of vault: {:?}", root_path);
        let start_time = Instant::now();

        if !root_path.is_dir() {
            return Err(ChroniclerError::NotADirectory(
                root_path.to_string_lossy().to_string(),
            ));
        }

        self.root_path = Some(root_path.to_path_buf());
        self.pages.clear();

        // First pass: Parse all markdown files and populate the pages map
        for entry in WalkDir::new(root_path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| is_markdown_file(e.path()))
        {
            let path = entry.path();
            match parser::parse_file(path) {
                Ok(page) => {
                    self.pages.insert(path.to_path_buf(), page);
                }
                Err(e) => warn!("Failed to parse file {:?}: {}", path, e),
            }
        }

        // Second pass: Build relationships between pages
        self.rebuild_relations();

        info!(
            "Full scan completed. Indexed {} pages (found {} tags and {} links) in {:?} seconds.",
            self.pages.len(),
            self.tags.len(),
            self.link_graph.values().count(),
            start_time.elapsed().as_secs_f64()
        );

        Ok(())
    }

    /// Processes a single file event and updates the index accordingly.
    ///
    /// This is the main entry point for event-driven index updates. It handles
    /// all types of file events (create, modify, delete, rename) and maintains
    /// the index's consistency.
    ///
    /// # Arguments
    /// * `event` - The file event to process
    pub fn handle_file_event(&mut self, event: &FileEvent) {
        match event {
            FileEvent::Created(path) => {
                info!("Handling file creation: {:?}", path);
                self.update_file(path);
            }
            FileEvent::Modified(path) => {
                info!("Handling file modification: {:?}", path);
                self.update_file(path);
            }
            FileEvent::Deleted(path) => {
                info!("Handling file deletion: {:?}", path);
                self.remove_file(path);
            }
            FileEvent::Renamed { from, to } => {
                info!("Handling file rename: {:?} -> {:?}", from, to);
                self.remove_file(from);
                self.update_file(to);
            }
        }
    }

    /// Updates the index for a single file that has been created or modified.
    /// This simplified approach removes all old data and rebuilds relationships,
    /// ensuring consistency without complex incremental logic.
    pub fn update_file(&mut self, path: &Path) {
        debug!("Updating file {:?}", path);
        let start_time = Instant::now();

        // Remove any existing page data
        self.pages.remove(path);

        match parser::parse_file(path) {
            Ok(new_page) => {
                // Add the newly parsed page to the index.
                self.pages.insert(path.to_path_buf(), new_page);
            }
            Err(e) => {
                warn!("Could not parse file for update {:?}: {}", path, e);
            }
        };

        // Always rebuild relations to clean up old data and establish new relationships.
        self.rebuild_relations();
        debug!(
            "File {:?} updated in {:?} seconds.",
            path,
            start_time.elapsed().as_secs_f64()
        );
    }

    /// Removes a file and all its relationships from the index.
    fn remove_file(&mut self, path: &Path) {
        if self.pages.remove(path).is_some() {
            // After removing the page, rebuild relations to clean up dangling links/backlinks.
            self.rebuild_relations();
        }
    }

    /// Rebuilds all relationships (tags, graph, backlinks) from scratch.
    fn rebuild_relations(&mut self) {
        // Rebuilding the resolver is a prerequisite for resolving links.
        self.rebuild_link_resolver();

        // Create local state to build into
        let mut new_tags: HashMap<String, HashSet<PathBuf>> = HashMap::new();
        let mut new_link_graph: HashMap<PathBuf, HashMap<PathBuf, Vec<Link>>> = HashMap::new();
        let mut new_backlinks: HashMap<PathBuf, HashSet<PathBuf>> = HashMap::new();

        for (source_path, page) in &self.pages {
            // Rebuild tag associations
            for tag in &page.tags {
                new_tags
                    .entry(tag.clone())
                    .or_default()
                    .insert(source_path.clone());
            }

            // Rebuild the link graph and calculate backlinks
            for link in &page.links {
                if let Some(target_path) = self.resolve_link(link) {
                    // Add the link to the graph.
                    new_link_graph
                        .entry(source_path.clone())
                        .or_default()
                        .entry(target_path.clone())
                        .or_default()
                        .push(link.clone());

                    // Register a backlink on the target page.
                    new_backlinks
                        .entry(target_path)
                        .or_default()
                        .insert(source_path.clone());
                }
            }
        }

        // Apply the newly calculated backlinks to all pages.
        for (path, page) in self.pages.iter_mut() {
            // Use .remove() for efficiency, as we don't need the new_backlinks map afterwards.
            page.backlinks = new_backlinks.remove(path).unwrap_or_default();
        }

        // Atomically swap the new state into place
        let _ = mem::replace(&mut self.tags, new_tags);
        let _ = mem::replace(&mut self.link_graph, new_link_graph);
    }

    /// Rebuilds the map for resolving link names to file paths.
    fn rebuild_link_resolver(&mut self) {
        self.link_resolver.clear();
        for path in self.pages.keys() {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                self.link_resolver.insert(stem.to_lowercase(), path.clone());
            }
        }
    }

    /// Resolves a wikilink to an absolute file path using the resolver map.
    pub fn resolve_link(&self, link: &Link) -> Option<PathBuf> {
        self.link_resolver.get(&link.target.to_lowercase()).cloned()
    }

    /// Generates a hierarchical file tree representation of the vault.
    ///
    /// # Returns
    /// `Result<FileNode>` representing the root of the file tree
    pub fn get_file_tree(&self) -> Result<FileNode> {
        let root = self
            .root_path
            .as_ref()
            .ok_or(ChroniclerError::VaultNotInitialized)?;
        let root_name = root
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        Self::build_tree_recursive(root, &root_name)
    }

    /// Recursively builds the file tree structure.
    fn build_tree_recursive(path: &Path, name: &str) -> Result<FileNode> {
        let mut children = Vec::new();

        if path.is_dir() {
            for entry in fs::read_dir(path)? {
                let entry = entry?;
                let path = entry.path();

                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    // Skip hidden files
                    if file_name.starts_with('.') {
                        continue;
                    }

                    if path.is_dir() {
                        children.push(Self::build_tree_recursive(&path, file_name)?);
                    } else if is_markdown_file(&path) {
                        children.push(FileNode {
                            name: file_name.to_string(),
                            path: path.clone(),
                            children: None,
                        });
                    }
                }
            }
        }

        // Sort children: directories first, then files, alphabetically within each group
        children.sort_by(|a, b| {
            let a_is_dir = a.children.is_some();
            let b_is_dir = b.children.is_some();
            a_is_dir
                .cmp(&b_is_dir)
                .reverse()
                .then_with(|| a.name.cmp(&b.name))
        });

        Ok(FileNode {
            name: name.to_string(),
            path: path.to_path_buf(),
            children: if children.is_empty() {
                None
            } else {
                Some(children)
            },
        })
    }
}
