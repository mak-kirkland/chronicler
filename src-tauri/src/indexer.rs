//! File indexer that registers page relationships.
//!
//! Event-driven indexer that maintains an in-memory index of all pages and tags.
//! The indexer processes individual file events but doesn't manage its own subscriptions.

use crate::{
    error::{ChroniclerError, Result},
    events::FileEvent,
    models::{FileNode, Page},
    parser,
    utils::is_markdown_file,
};
use log::{info, warn};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
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

        if !root_path.is_dir() {
            return Err(ChroniclerError::NotADirectory(
                root_path.to_string_lossy().to_string(),
            ));
        }

        self.root_path = Some(root_path.to_path_buf());
        self.pages.clear();
        self.tags.clear();

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

        info!("Full scan completed. Indexed {} pages.", self.pages.len());
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
                // Handle rename as a delete followed by a create
                self.remove_file(from);
                self.update_file(to);
            }
        }
    }

    /// Updates the index for a single file that has been created or modified.
    ///
    /// This method handles the complex logic of maintaining relationships
    /// between pages when a file changes, including updating backlinks and
    /// tag associations.
    pub fn update_file(&mut self, path: &Path) {
        // Remove any existing page data to get ownership
        let old_page = self.pages.remove(path);

        // Parse the file to get its current state
        let new_page = match parser::parse_file(path) {
            Ok(mut page) => {
                // Preserve old backlinks temporarily - they'll be recalculated
                if let Some(ref old) = old_page {
                    page.backlinks = old.backlinks.clone();
                }
                page
            }
            Err(e) => {
                warn!("Could not parse file for update {:?}: {}", path, e);
                // If parsing fails, ensure old data is cleaned up
                if let Some(page) = old_page {
                    self.remove_relationships(&page);
                }
                return;
            }
        };

        // Update tag associations
        let old_tags = old_page
            .as_ref()
            .map_or_else(HashSet::new, |p| p.tags.clone());
        self.update_tags_incrementally(path, &old_tags, &new_page.tags);

        // Update backlink relationships
        let old_links = old_page
            .as_ref()
            .map_or_else(HashSet::new, |p| p.links.clone());
        self.update_backlinks_incrementally(path, &old_links, &new_page.links);

        // Store the updated page in the index
        self.pages.insert(path.to_path_buf(), new_page);
    }

    /// Removes a file and all its relationships from the index.
    fn remove_file(&mut self, path: &Path) {
        if let Some(removed_page) = self.pages.remove(path) {
            self.remove_relationships(&removed_page);
        }
    }

    /// Removes all relationships (tags and backlinks) for a given page.
    fn remove_relationships(&mut self, page_to_remove: &Page) {
        // Remove from tag associations
        for tag in &page_to_remove.tags {
            if let Some(pages_with_tag) = self.tags.get_mut(tag) {
                pages_with_tag.remove(&page_to_remove.path);
                if pages_with_tag.is_empty() {
                    self.tags.remove(tag);
                }
            }
        }

        // Remove backlinks this page created on other pages
        for link_name in &page_to_remove.links {
            if let Some(target_path) = self.resolve_link(link_name) {
                if let Some(target_page) = self.pages.get_mut(&target_path) {
                    target_page.backlinks.remove(&page_to_remove.path);
                }
            }
        }
    }

    /// Incrementally updates tag associations for a file.
    fn update_tags_incrementally(
        &mut self,
        path: &Path,
        old_tags: &HashSet<String>,
        new_tags: &HashSet<String>,
    ) {
        // Remove tags that are no longer present
        for tag in old_tags.difference(new_tags) {
            if let Some(pages_with_tag) = self.tags.get_mut(tag) {
                pages_with_tag.remove(path);
                if pages_with_tag.is_empty() {
                    self.tags.remove(tag);
                }
            }
        }

        // Add new tags
        for tag in new_tags.difference(old_tags) {
            self.tags
                .entry(tag.clone())
                .or_default()
                .insert(path.to_path_buf());
        }
    }

    /// Incrementally updates backlink relationships for a file.
    fn update_backlinks_incrementally(
        &mut self,
        path: &Path,
        old_links: &HashSet<String>,
        new_links: &HashSet<String>,
    ) {
        // Remove backlinks for links that no longer exist
        for link_name in old_links.difference(new_links) {
            if let Some(target_path) = self.resolve_link(link_name) {
                if let Some(target_page) = self.pages.get_mut(&target_path) {
                    target_page.backlinks.remove(path);
                }
            }
        }

        // Add backlinks for new links
        for link_name in new_links.difference(old_links) {
            if let Some(target_path) = self.resolve_link(link_name) {
                if let Some(target_page) = self.pages.get_mut(&target_path) {
                    target_page.backlinks.insert(path.to_path_buf());
                }
            }
        }
    }

    /// Rebuilds all relationships (tags and backlinks) from scratch.
    ///
    /// This is used during the initial full scan to establish all relationships
    /// after all pages have been parsed and indexed.
    fn rebuild_relations(&mut self) {
        let mut new_tags: HashMap<String, HashSet<PathBuf>> = HashMap::new();
        let mut new_backlinks: HashMap<PathBuf, HashSet<PathBuf>> = HashMap::new();

        // Create a snapshot of current pages to avoid borrow checker issues
        let pages_clone = self.pages.clone();

        for (path, page) in &pages_clone {
            // Rebuild tag associations
            for tag in &page.tags {
                new_tags
                    .entry(tag.clone())
                    .or_default()
                    .insert(path.clone());
            }

            // Calculate backlinks
            for link_name in &page.links {
                if let Some(target_path) = self.resolve_link(link_name) {
                    new_backlinks
                        .entry(target_path)
                        .or_default()
                        .insert(path.clone());
                }
            }
        }

        // Update the index with new relationships
        self.tags = new_tags;

        // Apply backlinks to all pages
        for (path, page) in self.pages.iter_mut() {
            page.backlinks = new_backlinks.remove(path).unwrap_or_default();
        }
    }

    /// Resolves a wikilink name to an absolute file path.
    ///
    /// This performs a case-insensitive search through all indexed pages
    /// to find a file whose stem matches the link name.
    ///
    /// # Arguments
    /// * `link_name` - The name of the link to resolve (without [[ ]])
    ///
    /// # Returns
    /// `Some(PathBuf)` if a matching file is found, `None` otherwise
    pub fn resolve_link(&self, link_name: &str) -> Option<PathBuf> {
        let link_lower = link_name.to_lowercase();
        self.pages
            .keys()
            .find(|path| {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .is_some_and(|stem| stem.to_lowercase() == link_lower)
            })
            .cloned()
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
