//! File indexer that registers page relationships.
//!
//! Event-driven indexer that maintains an in-memory index of all pages and tags.
//! The indexer processes individual file events but doesn't manage its own subscriptions.

use crate::{
    error::{ChroniclerError, Result},
    events::FileEvent,
    models::{FileNode, Link, Page, PageHeader},
    parser,
    utils::{is_markdown_file, path_to_stem_string},
    wikilink::WIKILINK_RE,
};
use regex::Captures;
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
    pub fn full_scan(&mut self, root_path: &Path) -> Result<()> {
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
                        title: path_to_stem_string(path),
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

    /// Processes a single file event and updates the index accordingly.
    ///
    /// This is the main entry point for event-driven index updates. It handles
    /// all types of file events (create, modify, delete, rename) and maintains
    /// the index's consistency.
    ///
    /// # Arguments
    /// * `event` - The file event to process
    #[instrument(level = "debug", skip(self))]
    // TODO: Updates and deletion should handle folder events too
    // Currently if we delete a folder externally, the index won't update!
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
    #[instrument(level = "debug", skip(self))]
    pub fn update_file(&mut self, path: &Path) {
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
    }

    /// Removes a file and all its relationships from the index.
    #[instrument(level = "debug", skip(self))]
    fn remove_file(&mut self, path: &Path) {
        if self.pages.remove(path).is_some() {
            // After removing the page, rebuild relations to clean up dangling links/backlinks.
            self.rebuild_relations();
        }
    }

    /// Rebuilds all relationships (tags, graph, backlinks) from scratch.
    #[instrument(level = "debug", skip(self))]
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
        let is_directory = path.is_dir();
        let mut children = if is_directory { Some(Vec::new()) } else { None };

        if is_directory {
            if let Some(children_vec) = children.as_mut() {
                for entry in fs::read_dir(path)? {
                    let entry = entry?;
                    let child_path = entry.path();

                    if let Some(file_name) = child_path.file_name().and_then(|n| n.to_str()) {
                        // Skip hidden files
                        if file_name.starts_with('.') {
                            continue;
                        }

                        // We only care about directories and markdown files.
                        if child_path.is_dir() || is_markdown_file(&child_path) {
                            children_vec.push(Self::build_tree_recursive(&child_path, file_name)?);
                        }
                    }
                }

                // Sort children: directories first, then files, alphabetically
                children_vec.sort_by(|a, b| {
                    a.is_directory
                        .cmp(&b.is_directory)
                        .reverse()
                        .then_with(|| a.name.cmp(&b.name))
                });
            }
        }

        Ok(FileNode {
            name: if is_directory {
                name.to_string()
            } else {
                path_to_stem_string(path)
            },
            path: path.to_path_buf(),
            is_directory,
            children,
        })
    }

    /// Creates a new, empty markdown file and synchronously updates the index.
    #[instrument(skip(self))]
    pub fn create_new_file(&mut self, parent_dir: String, file_name: String) -> Result<PageHeader> {
        let trimmed_name = file_name.trim();
        let mut clean_name = trimmed_name.to_string();
        if !clean_name.to_lowercase().ends_with(".md") {
            clean_name.push_str(".md");
        }

        let path = Path::new(&parent_dir).join(&clean_name);

        if path.exists() {
            return Err(ChroniclerError::FileAlreadyExists(path));
        }

        // Create the file with some default frontmatter for a better user experience.
        let default_content = format!(
            r#"---
title: {}
tags: [add, your, tags]
---

"#,
            trimmed_name
        );

        fs::write(&path, default_content)?;

        // Manually and synchronously update the index for the new file before returning.
        // This prevents the race condition where the frontend tries to access the file
        // before the watcher has processed it.
        self.update_file(&path);

        let title = path_to_stem_string(&path);
        Ok(PageHeader { title, path })
    }

    /// Creates a new, empty folder.
    #[instrument(skip(self))]
    pub fn create_new_folder(&self, parent_dir: String, folder_name: String) -> Result<()> {
        let path = Path::new(&parent_dir).join(folder_name.trim());
        if path.exists() {
            return Err(ChroniclerError::FileAlreadyExists(path));
        }
        fs::create_dir_all(path)?;
        // The file watcher will pick up this change and trigger a global index update.
        Ok(())
    }

    /// Renames a file or folder, updates all links pointing to it, and updates the index.
    #[instrument(skip(self))]
    pub fn rename_path(&mut self, old_path: PathBuf, new_name: String) -> Result<()> {
        let parent = old_path
            .parent()
            .ok_or_else(|| ChroniclerError::InvalidPath(old_path.clone()))?;
        let mut new_path = parent.join(new_name.trim());

        // For files, ensure the .md extension is preserved or added.
        if old_path.is_file() && !new_path.to_string_lossy().to_lowercase().ends_with(".md") {
            let stem = path_to_stem_string(&new_path);
            new_path.set_file_name(format!("{}.md", stem));
        }

        if new_path.exists() {
            return Err(ChroniclerError::FileAlreadyExists(new_path));
        }

        // --- 1. Update links in other files before renaming to avoid race with file watcher ---
        // TODO: Make this transactional
        if old_path.is_file() {
            if let Some(page_to_rename) = self.pages.get(&old_path) {
                let old_name_stem = path_to_stem_string(&old_path);
                let new_name_stem = path_to_stem_string(&new_path);
                let backlinks = page_to_rename.backlinks.clone();

                for backlink_path in backlinks {
                    if let Err(e) =
                        self.update_links_in_file(&backlink_path, &old_name_stem, &new_name_stem)
                    {
                        // TODO: Notify the user
                        warn!("Failed to update links in file {:?}: {}", backlink_path, e);
                    }
                }
            }
        }

        // --- 2. Perform the actual file system rename ---
        fs::rename(&old_path, &new_path)?;

        // --- 3. Update the in-memory index ---
        // This logic handles both file renames and directory renames.
        let old_path_str = old_path.to_string_lossy();
        let new_path_str = new_path.to_string_lossy();
        let pages_to_update: Vec<PathBuf> = self.pages.keys().cloned().collect();
        let mut updated_pages = HashMap::new();

        for path in pages_to_update {
            // Check if the page was the renamed item itself or inside a renamed directory
            if path.starts_with(&old_path) {
                let new_page_path_str =
                    path.to_string_lossy()
                        .replacen(&*old_path_str, &new_path_str, 1);
                let new_page_path = PathBuf::from(new_page_path_str);

                if let Some(mut page) = self.pages.remove(&path) {
                    page.path = new_page_path.clone();
                    updated_pages.insert(new_page_path, page);
                }
            }
        }

        self.pages.extend(updated_pages);
        self.rebuild_relations();

        Ok(())
    }

    /// Helper function to update wikilinks within a single file.
    fn update_links_in_file(&self, file_path: &Path, old_stem: &str, new_stem: &str) -> Result<()> {
        let content = fs::read_to_string(file_path)?;
        let old_stem_lower = old_stem.to_lowercase();

        let new_content = WIKILINK_RE.replace_all(&content, |caps: &Captures| {
            let target = caps.get(1).map_or("", |m| m.as_str());
            if target.to_lowercase() == old_stem_lower {
                let section = caps.get(2).map_or("", |m| m.as_str());
                let alias = caps.get(3).map_or("", |m| m.as_str());

                let mut new_link = format!("[[{}", new_stem);
                if !section.is_empty() {
                    new_link.push('#');
                    new_link.push_str(section);
                }
                if !alias.is_empty() {
                    new_link.push('|');
                    new_link.push_str(alias);
                }
                new_link.push_str("]]");
                new_link
            } else {
                // Return the original match if the target doesn't match
                caps.get(0).unwrap().as_str().to_string()
            }
        });

        // Only write to the file if the content has actually changed.
        if new_content != content {
            info!("Updating links in file: {:?}", file_path);
            fs::write(file_path, new_content.as_bytes())?;
        }

        Ok(())
    }

    /// Deletes a file or folder and updates the index.
    #[instrument(skip(self))]
    pub fn delete_path(&mut self, path: PathBuf) -> Result<()> {
        if path.is_dir() {
            fs::remove_dir_all(&path)?;
            // Remove all pages from the index that were inside this directory
            self.pages.retain(|p, _| !p.starts_with(&path));
        } else {
            fs::remove_file(&path)?;
            self.pages.remove(&path);
        }

        // A delete requires rebuilding all relationships to remove dangling links.
        self.rebuild_relations();
        Ok(())
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
                if child.is_directory {
                    dirs.push(child.path.clone());
                    Self::collect_dirs_recursive(child, dirs);
                }
            }
        }
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
    fn test_indexer_full_scan() {
        let (_dir, page1_path, page2_path, page3_path) = setup_test_vault();
        let root = _dir.path();
        let mut indexer = Indexer::new(root);

        indexer.full_scan(root).unwrap();

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
        indexer.full_scan(root).unwrap();

        // --- Test Deletion ---
        indexer.handle_file_event(&FileEvent::Deleted(page1_path.clone()));

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
        indexer.handle_file_event(&FileEvent::Created(new_page_path.clone()));

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
        indexer.handle_file_event(&FileEvent::Modified(page3_path.clone()));
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
    fn test_rename_path_updates_links() {
        let (_dir, page1_path, page2_path, _page3_path) = setup_test_vault();
        let root = _dir.path();
        let mut indexer = Indexer::new(root);
        indexer.full_scan(root).unwrap();

        // Rename "Page One.md" to "First Chapter.md"
        let new_name = "First Chapter".to_string();
        indexer.rename_path(page1_path.clone(), new_name).unwrap();

        // Check that the link in Page Two has been updated on disk
        let page2_content = fs::read_to_string(&page2_path).unwrap();
        assert!(page2_content.contains("[[First Chapter]]"));
        assert!(!page2_content.contains("[[Page One]]"));

        // Check that the index has been updated
        let new_path = root.join("First Chapter.md");
        assert!(indexer.pages.contains_key(&new_path));
        assert!(!indexer.pages.contains_key(&page1_path));
        assert!(indexer
            .link_resolver
            .contains_key(&"first chapter".to_lowercase()));
        assert!(!indexer
            .link_resolver
            .contains_key(&"page one".to_lowercase()));
    }
}
