//! File indexer that registers page relationships.
//!
//! Event-driven indexer that maintains an in-memory index of all pages and tags.
//! The indexer processes individual file events but doesn't manage its own subscriptions.

use crate::{
    error::{ChroniclerError, Result},
    events::FileEvent,
    models::{BrokenLink, FileNode, FileType, Link, Page, PageHeader},
    parser,
    utils::{file_stem_string, is_image_file, is_markdown_file},
};
use natord::compare as nat_compare;
use std::{
    collections::{HashMap, HashSet},
    fs, mem,
    path::{Path, PathBuf},
    time::Instant,
};
use tracing::{info, instrument, warn};
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
    pub fn scan_vault(&mut self, root_path: &Path) -> Result<()> {
        info!(path = %root_path.display(), "Starting full vault scan");
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

                // If a file has malformed frontmatter, instead of just skipping it,
                // we create a default Page object. This ensures the file is still
                // "known" to the index and can be opened in the app to be fixed.
                Err(e) => {
                    warn!(
                        "Failed to parse file {:?}, creating a default entry: {}",
                        path, e
                    );
                    let default_page = Page {
                        path: path.to_path_buf(),
                        title: file_stem_string(path),
                        tags: HashSet::new(),
                        links: Vec::new(),
                        backlinks: HashSet::new(),
                        frontmatter: serde_json::Value::Null,
                    };
                    self.pages.insert(path.to_path_buf(), default_page);
                }
            }
        }

        // Second pass: Build relationships between pages
        self.rebuild_relations();

        let links_found = self
            .link_graph
            .values()
            .flat_map(|targets| targets.values())
            .map(|links| links.len())
            .sum::<usize>();

        info!(
            pages_indexed = self.pages.len(),
            tags_found = self.tags.len(),
            links_found,
            duration_ms = start_time.elapsed().as_millis(),
            "Full scan completed"
        );

        Ok(())
    }

    /// Processes a batch of events and rebuilds relations once at the end.
    /// This is the primary method for handling asynchronous updates from the file watcher.
    #[instrument(level = "debug", skip(self, events))]
    pub fn handle_event_batch(&mut self, events: &[FileEvent]) {
        for event in events {
            self.handle_file_event(event); // Call the low-level handler for each event
        }
        self.rebuild_relations(); // Rebuild all relationships only once
    }

    /// Processes a single UI-initiated event and rebuilds relations immediately.
    /// This provides instant feedback for actions taken within the application.
    #[instrument(level = "debug", skip(self))]
    pub fn handle_event_and_rebuild(&mut self, event: &FileEvent) {
        self.handle_file_event(event); // Call the low-level handler
        self.rebuild_relations(); // Rebuild immediately
    }

    /// Routes a single file event to the appropriate state modification
    /// method without rebuilding relations. This is the core router for all state changes.
    fn handle_file_event(&mut self, event: &FileEvent) {
        match event {
            FileEvent::Created(path) => {
                info!("Handling file creation: {:?}", path);
                self.update_file(path);
            }
            FileEvent::FolderCreated(path) => {
                info!("Handling folder creation: {:?}", path);
                // No action is needed on the index itself, as empty folders
                // don't contain pages or links. The app's overall "world changed"
                // event will trigger a UI refresh of the file tree.
            }
            FileEvent::Modified(path) => {
                info!("Handling file modification: {:?}", path);
                self.update_file(path);
            }
            FileEvent::Deleted(path) => {
                info!("Handling file deletion: {:?}", path);
                self.remove_file(path);
            }
            FileEvent::FolderDeleted(path) => {
                info!("Handling folder deletion: {:?}", path);
                self.remove_folder(path);
            }
            FileEvent::Renamed { from, to } => {
                info!("Handling file rename: {:?} -> {:?}", from, to);
                self.handle_rename(from, to);
            }
        }
    }

    /// Updates the index for a single file that has been created or modified.
    #[instrument(level = "debug", skip(self))]
    pub fn update_file(&mut self, path: &Path) {
        // Remove any existing page data to ensure we're working with fresh info.
        self.pages.remove(path);

        match parser::parse_file(path) {
            Ok(new_page) => {
                // On success, add the newly parsed page to the index.
                self.pages.insert(path.to_path_buf(), new_page);
            }
            Err(e) => {
                // On failure, log the error but still create a default entry.
                // This ensures the file remains accessible in the UI to be fixed.
                warn!("Could not parse file for update {:?}: {}", path, e);
                let default_page = Page {
                    path: path.to_path_buf(),
                    title: file_stem_string(path),
                    tags: HashSet::new(),
                    links: Vec::new(),
                    backlinks: HashSet::new(),
                    frontmatter: serde_json::Value::Null,
                };
                self.pages.insert(path.to_path_buf(), default_page);
            }
        };
    }

    /// Removes a file and all its relationships from the index.
    #[instrument(level = "debug", skip(self))]
    fn remove_file(&mut self, path: &Path) {
        self.pages.remove(path);
    }

    /// Removes a folder and all its descendant pages from the index.
    #[instrument(level = "debug", skip(self))]
    fn remove_folder(&mut self, path: &Path) {
        // Retain only the pages that do NOT start with the deleted folder's path.
        self.pages
            .retain(|page_path, _| !page_path.starts_with(path));
    }

    /// Handles an in-memory rename of a file or folder.
    #[instrument(level = "debug", skip(self))]
    fn handle_rename(&mut self, from: &Path, to: &Path) {
        // Check if the destination is a directory to determine the rename type.
        // This is reliable because the watcher fires events after the action has occurred.
        let is_folder_rename = to.is_dir();

        let pages_to_update: Vec<_> = self
            .pages
            .keys()
            .filter(|p| p.starts_with(from))
            .cloned()
            .collect();

        for old_path in pages_to_update {
            // Remove the old page from the index to be replaced.
            self.pages.remove(&old_path);

            // --- Path Calculation Logic ---
            let new_path = if is_folder_rename {
                // CASE 1: A FOLDER was renamed.
                // The new path is the new folder path joined with the file's relative path.
                // e.g., to: /new_dir, relative_path: file.md -> /new_dir/file.md
                let relative_path = old_path
                    .strip_prefix(from)
                    .expect("Path of a child should always have the parent as a prefix");
                to.join(relative_path)
            } else {
                // CASE 2: A single FILE was renamed.
                to.to_path_buf()
            };

            // Re-parse the file at its new location to get fresh, consistent data.
            match parser::parse_file(&new_path) {
                Ok(new_page) => {
                    self.pages.insert(new_path, new_page);
                }
                Err(e) => {
                    warn!(
                        "Could not re-parse renamed file {:?}, creating a default entry: {}",
                        new_path, e
                    );
                    let default_page = Page {
                        path: new_path.clone(),
                        title: file_stem_string(&new_path),
                        tags: HashSet::new(),
                        links: Vec::new(),
                        backlinks: HashSet::new(),
                        frontmatter: serde_json::Value::Null,
                    };
                    self.pages.insert(new_path, default_page);
                }
            }
        }
    }

    /// Rebuilds all relationships (tags, graph, backlinks) from scratch.
    #[instrument(level = "info", skip(self))]
    pub fn rebuild_relations(&mut self) {
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
    #[instrument(level = "debug", skip(self))]
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

    /// Returns all tags and the pages that reference them.
    #[instrument(level = "debug", skip(self))]
    pub fn get_all_tags(&self) -> Result<Vec<(String, Vec<PageHeader>)>> {
        // Collect all tags and their associated page references first
        let mut tags: Vec<_> = self
            .tags
            .iter()
            .map(|(tag, paths)| {
                // Get all pages for this tag in one go
                let mut pages: Vec<_> = paths
                    .iter()
                    .filter_map(|path| {
                        self.pages.get(path).map(|p| PageHeader {
                            path: p.path.clone(),
                            title: p.title.clone(),
                        })
                    })
                    .collect();

                // Sort pages by title (case-insensitive)
                pages.sort_by_key(|page| page.title.to_lowercase());

                (tag.clone(), pages)
            })
            .collect();

        // Sort tags by name
        tags.sort_by(|a, b| a.0.cmp(&b.0));

        Ok(tags)
    }

    /// Generates a hierarchical file tree representation of the vault.
    ///
    /// # Returns
    /// `Result<FileNode>` representing the root of the file tree
    #[instrument(level = "debug", skip(self))]
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
    #[instrument(level = "debug", skip(path, name))]
    fn build_tree_recursive(path: &Path, name: &str) -> Result<FileNode> {
        // Determine the file type first.
        let file_type = if path.is_dir() {
            FileType::Directory
        } else if is_image_file(path) {
            FileType::Image
        } else {
            FileType::Markdown
        };

        let mut children = if file_type == FileType::Directory {
            Some(Vec::new())
        } else {
            None
        };

        if file_type == FileType::Directory {
            if let Some(children_vec) = children.as_mut() {
                for entry in fs::read_dir(path)? {
                    let entry = entry?;
                    let child_path = entry.path();

                    if let Some(file_name) = child_path.file_name().and_then(|n| n.to_str()) {
                        // Skip hidden files
                        if file_name.starts_with('.') {
                            continue;
                        }
                        if child_path.is_dir()
                            || is_markdown_file(&child_path)
                            || is_image_file(&child_path)
                        {
                            children_vec.push(Self::build_tree_recursive(&child_path, file_name)?);
                        }
                    }
                }

                // Sort children: directories first (based on Ord impl), then alphanumerically by name.
                children_vec.sort_by(|a, b| {
                    a.file_type
                        .cmp(&b.file_type)
                        .then_with(|| nat_compare(&a.name, &b.name))
                });
            }
        }

        let name = if file_type == FileType::Markdown {
            file_stem_string(path)
        } else {
            name.to_string()
        };

        Ok(FileNode {
            name,
            path: path.to_path_buf(),
            file_type,
            children,
        })
    }

    /// Returns a list of all directory paths in the vault.
    pub fn get_all_directory_paths(&self) -> Result<Vec<PathBuf>> {
        let root_node = self.get_file_tree()?;
        let mut dirs = Vec::new();
        // Add the root directory itself
        dirs.push(root_node.path.clone());
        Self::collect_dirs_recursive(&root_node, &mut dirs);
        Ok(dirs)
    }

    /// Helper function to recursively collect directory paths.
    fn collect_dirs_recursive(node: &FileNode, dirs: &mut Vec<PathBuf>) {
        if let Some(children) = &node.children {
            for child in children {
                if child.file_type == FileType::Directory {
                    dirs.push(child.path.clone());
                    Self::collect_dirs_recursive(child, dirs);
                }
            }
        }
    }

    /// Finds all broken links in the vault and aggregates them by target.
    #[instrument(level = "debug", skip(self))]
    pub fn get_all_broken_links(&self) -> Result<Vec<BrokenLink>> {
        let mut broken_links_map: HashMap<String, HashSet<PageHeader>> = HashMap::new();

        // Iterate through all pages and their outgoing links
        for (source_path, page) in &self.pages {
            for link in &page.links {
                // A link is broken if it cannot be resolved by the indexer.
                if self.resolve_link(link).is_none() {
                    let source_header = PageHeader {
                        path: source_path.clone(),
                        title: page.title.clone(),
                    };
                    // Add the source page to the set for this broken target.
                    broken_links_map
                        .entry(link.target.clone())
                        .or_default()
                        .insert(source_header);
                }
            }
        }

        // Convert the map into the final Vec<BrokenLink> structure for the frontend.
        let mut result: Vec<BrokenLink> = broken_links_map
            .into_iter()
            .map(|(target, sources_set)| {
                let mut sources: Vec<PageHeader> = sources_set.into_iter().collect();
                // Sort the source pages by title using natural ordering.
                sources.sort_by(|a, b| nat_compare(&a.title, &b.title));
                BrokenLink { target, sources }
            })
            .collect();

        // Sort the final list of broken links by their target name using natural ordering.
        result.sort_by(|a, b| nat_compare(&a.target, &b.target));

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::FileEvent;
    use std::{collections::HashSet, fs, path::PathBuf};
    use tempfile::tempdir;

    /// Helper function to set up a temporary vault with some files
    fn setup_test_vault() -> (tempfile::TempDir, PathBuf, PathBuf, PathBuf) {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let page1_path = root.join("Page One.md");
        fs::write(
            &page1_path,
            r#"---
title: "First Page"
tags: ["alpha", "beta"]
---
This page links to [[Page Two]].
"#,
        )
        .unwrap();

        let page2_path = root.join("Page Two.md");
        fs::write(
            &page2_path,
            r#"---
title: "Second Page"
tags: ["beta", "gamma"]
---
This page links back to [[Page One]] and also to [[Page Three|a different name]].
"#,
        )
        .unwrap();

        let page3_path = root.join("Page Three.md");
        fs::write(
            &page3_path,
            r#"---
title: "Third Page"
tags: ["gamma"]
---
No outgoing links here.
"#,
        )
        .unwrap();

        (dir, page1_path, page2_path, page3_path)
    }

    #[test]
    fn test_indexer_scan_vault() {
        let (_dir, page1_path, page2_path, page3_path) = setup_test_vault();
        let root = _dir.path();
        let mut indexer = Indexer::new(root);

        indexer.scan_vault(root).unwrap();

        // Test pages count
        assert_eq!(indexer.pages.len(), 3);

        // Test tags
        assert_eq!(indexer.tags.len(), 3);
        assert_eq!(
            indexer.tags.get("alpha").unwrap(),
            &HashSet::from([page1_path.clone()])
        );
        assert_eq!(
            indexer.tags.get("beta").unwrap(),
            &HashSet::from([page1_path.clone(), page2_path.clone()])
        );
        assert_eq!(
            indexer.tags.get("gamma").unwrap(),
            &HashSet::from([page2_path.clone(), page3_path.clone()])
        );

        // Test link graph and backlinks
        let page1 = indexer.pages.get(&page1_path).unwrap();
        let page2 = indexer.pages.get(&page2_path).unwrap();
        let page3 = indexer.pages.get(&page3_path).unwrap();

        // Page 1 has an outgoing link to Page 2, so Page 2 should have a backlink from Page 1.
        assert_eq!(page1.links.len(), 1);
        assert!(page2.backlinks.contains(&page1_path));

        // Page 2 links to Page 1 and Page 3.
        assert_eq!(page2.links.len(), 2);
        assert!(page1.backlinks.contains(&page2_path));
        assert!(page3.backlinks.contains(&page2_path));

        // Test link resolver
        assert_eq!(indexer.resolve_link(&page1.links[0]).unwrap(), page2_path);
        assert_eq!(indexer.resolve_link(&page2.links[0]).unwrap(), page1_path);
        assert_eq!(indexer.resolve_link(&page2.links[1]).unwrap(), page3_path);
    }

    #[test]
    fn test_indexer_file_events() {
        let (_dir, page1_path, page2_path, page3_path) = setup_test_vault();
        let root = _dir.path();
        let mut indexer = Indexer::new(root);
        indexer.scan_vault(root).unwrap();

        // --- Test Deletion ---
        indexer.handle_event_and_rebuild(&FileEvent::Deleted(page1_path.clone()));

        assert_eq!(indexer.pages.len(), 2);
        assert!(!indexer.tags.contains_key("alpha")); // alpha tag should be gone

        // The link from page 2 to the now-deleted page 1 will be dangling,
        // but the backlink *from* page 1 on other pages should be removed.
        // Let's re-fetch Page 3 to check its backlinks.
        let page3 = indexer.pages.get(&page3_path).unwrap();
        assert!(page3.backlinks.contains(&page2_path)); // This should still be there.

        let page2_after_delete = indexer.pages.get(&page2_path).unwrap();
        assert!(page2_after_delete.backlinks.is_empty()); // Backlink from page1 is gone.

        // --- Test Creation ---
        let new_page_path = root.join("New Page.md");
        fs::write(
            &new_page_path,
            r#"---
tags: ["new", "alpha"]
---
Linking to [[Page Two]]
"#,
        )
        .unwrap();
        indexer.handle_event_and_rebuild(&FileEvent::Created(new_page_path.clone()));

        assert_eq!(indexer.pages.len(), 3);
        assert!(indexer.tags.contains_key("new"));
        assert!(indexer.tags.contains_key("alpha")); // alpha is back
        let page2 = indexer.pages.get(&page2_path).unwrap();
        // Page 2 should now have a backlink from New Page
        assert!(page2.backlinks.contains(&new_page_path));
        assert_eq!(page2.backlinks.len(), 1);

        // --- Test Modification ---
        fs::write(
            &page3_path,
            r#"---
title: "Third Page Modified"
tags: ["gamma", "modified"]
---
Now I link to [[Page Two]]!
"#,
        )
        .unwrap();
        indexer.handle_event_and_rebuild(&FileEvent::Modified(page3_path.clone()));
        let page3 = indexer.pages.get(&page3_path).unwrap();
        assert_eq!(page3.title, "Third Page Modified");
        assert!(page3.tags.contains("modified"));
        assert_eq!(page3.links.len(), 1);

        let page2 = indexer.pages.get(&page2_path).unwrap();
        // Page 2 should now have backlinks from both New Page and Page 3
        assert_eq!(page2.backlinks.len(), 2);
        assert!(page2.backlinks.contains(&new_page_path));
        assert!(page2.backlinks.contains(&page3_path));
    }

    #[test]
    fn test_get_all_broken_links() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let page1_path = root.join("Page One.md");
        fs::write(&page1_path, "Links to [[Page Two]] and [[Missing Page]].").unwrap();

        let page2_path = root.join("Page Two.md");
        fs::write(&page2_path, "Links to [[Another Missing Page]].").unwrap();

        let mut indexer = Indexer::new(root);
        indexer.scan_vault(root).unwrap();

        let broken_links = indexer.get_all_broken_links().unwrap();

        assert_eq!(broken_links.len(), 2);

        // Find the "Another Missing Page" report (results are sorted)
        let another_missing = broken_links
            .iter()
            .find(|bl| bl.target == "Another Missing Page")
            .unwrap();
        assert_eq!(another_missing.sources.len(), 1);
        assert_eq!(another_missing.sources[0].path, page2_path);

        // Find the "Missing Page" report
        let missing_page = broken_links
            .iter()
            .find(|bl| bl.target == "Missing Page")
            .unwrap();
        assert_eq!(missing_page.sources.len(), 1);
        assert_eq!(missing_page.sources[0].path, page1_path);
    }
}
