//! File indexer that registers page relationships.
//!
//! Event-driven indexer that maintains an in-memory index of all pages and tags.
//! The indexer processes individual file events but doesn't manage its own subscriptions.

use crate::{
    error::{ChroniclerError, Result},
    events::FileEvent,
    models::{
        BrokenImage, BrokenLink, FileNode, FileType, Link, MapConfig, Page, PageHeader, ParseError,
        VaultAsset,
    },
    parser,
    utils::{file_stem_string, is_image_file, is_map_file, is_markdown_file},
};
use natord::compare_ignore_case as nat_compare;
use rayon::prelude::*;
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
    /// A unified map of all tracked assets (pages, images, etc.) in the vault, keyed by their absolute path.
    pub assets: HashMap<PathBuf, VaultAsset>,
    pub tags: HashMap<String, HashSet<PathBuf>>,
    /// A map of files that failed to parse, storing their path and the error message.
    /// This is used to generate the "Parse Errors" report.
    pub parse_errors: HashMap<PathBuf, String>,

    /// Fast lookup for resolving a normalized link name (String) to a file path.
    pub link_resolver: HashMap<String, PathBuf>,

    /// Fast lookup for resolving a media filename (e.g., "map.png") to its full file path.
    /// This will be used for images, and in the future, for audio files.
    pub media_resolver: HashMap<String, PathBuf>,

    /// Stores the complete link graph: Source Path -> Target Path -> Vec<Link>.
    /// The Vec<Link> captures every link instance, to calculate link strength.
    pub link_graph: HashMap<PathBuf, HashMap<PathBuf, Vec<Link>>>,

    /// Stores the reverse index for Maps: Page Path -> Set of Map Paths that link to it.
    /// Used to populate the "Associated Maps" list in the file view.
    pub map_backlinks: HashMap<PathBuf, HashSet<PathBuf>>,
}

/// Helper struct to hold the result of processing a single file during scan.
struct ScanResult {
    path: PathBuf,
    asset: Option<VaultAsset>,
    error: Option<String>,
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

    /// A helper function that processes a single file path.
    ///
    /// This function performs the I/O (reading) and CPU work (parsing) for a file
    /// and returns a `ScanResult`. It does not modify the Indexer state directly,
    /// making it safe to use in parallel iterators.
    fn process_path(path: PathBuf) -> ScanResult {
        // RESOLVE SYMLINKS: Get the canonical path for consistent indexing.
        let canonical_path = match dunce::canonicalize(&path) {
            Ok(p) => p,
            Err(e) => {
                warn!("Could not get canonical path for {:?}: {}", path, e);
                return ScanResult {
                    path,
                    asset: None,
                    error: Some(format!("Canonicalization error: {}", e)),
                };
            }
        };

        if is_markdown_file(&canonical_path) {
            match parser::parse_file(&canonical_path) {
                Ok(page) => ScanResult {
                    path: canonical_path,
                    asset: Some(VaultAsset::Page(Box::new(page))),
                    error: None,
                },
                Err(e) => {
                    warn!("Could not parse file {:?}: {}", path, e);
                    // Create a default page entry so the file is still visible in the UI
                    let default_page = Page {
                        path: canonical_path.clone(),
                        title: file_stem_string(&canonical_path),
                        ..Default::default()
                    };
                    ScanResult {
                        path: canonical_path,
                        asset: Some(VaultAsset::Page(Box::new(default_page))),
                        error: Some(e.to_string()),
                    }
                }
            }
        } else if is_image_file(&canonical_path) {
            ScanResult {
                path: canonical_path,
                asset: Some(VaultAsset::Image),
                error: None,
            }
        } else if is_map_file(&canonical_path) {
            match fs::read_to_string(&canonical_path) {
                Ok(content) => match serde_json::from_str::<MapConfig>(&content) {
                    Ok(config) => ScanResult {
                        path: canonical_path,
                        asset: Some(VaultAsset::Map(Box::new(config))),
                        error: None,
                    },
                    Err(e) => ScanResult {
                        path: canonical_path,
                        asset: None,
                        error: Some(format!("Map parse error: {}", e)),
                    },
                },
                Err(e) => ScanResult {
                    path: canonical_path,
                    asset: None,
                    error: Some(format!("Could not read map file: {}", e)),
                },
            }
        } else {
            // Ignore other file types
            ScanResult {
                path: canonical_path,
                asset: None,
                error: None,
            }
        }
    }

    /// Performs a complete scan of the vault directory to build the initial index.
    ///
    /// This is typically called once during application startup before starting
    /// the event-driven updates. After this completes, the indexer will maintain
    /// its state through file change events.
    ///
    /// This uses `rayon` to parse files in parallel, significantly speeding up
    /// the initialization process for large vaults.
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

        // Clear all previous state for the full rescan.
        self.root_path = Some(root_path.to_path_buf());
        self.assets.clear();
        self.tags.clear();
        self.parse_errors.clear();
        self.link_resolver.clear();
        self.media_resolver.clear();
        self.link_graph.clear();
        self.map_backlinks.clear();

        // 1. Collect all file paths first.
        let paths: Vec<PathBuf> = WalkDir::new(root_path)
            .follow_links(true) // Handle symlinks
            .into_iter()
            .filter_map(|e| e.ok())
            .map(|e| e.path().to_path_buf())
            .collect();

        // 2. Process files in PARALLEL using Rayon.
        let results: Vec<ScanResult> = paths
            .into_par_iter() // Parallel iterator taking ownership of paths
            .map(Self::process_path)
            .collect();

        // 3. Update the index sequentially (very fast map insertion).
        for result in results {
            if let Some(asset) = result.asset {
                self.assets.insert(result.path.clone(), asset);
            }
            if let Some(error) = result.error {
                self.parse_errors.insert(result.path, error);
            }
        }

        // Second pass: Build relationships between pages now that all assets are indexed.
        self.rebuild_relations();

        let (page_count, image_count, map_count) =
            self.assets
                .values()
                .fold((0, 0, 0), |(p, i, m), asset| match asset {
                    VaultAsset::Page(_) => (p + 1, i, m),
                    VaultAsset::Image => (p, i + 1, m),
                    VaultAsset::Map(_) => (p, i, m + 1),
                });

        let links_found = self
            .link_graph
            .values()
            .flat_map(|targets| targets.values())
            .map(|links| links.len())
            .sum::<usize>();

        info!(
            pages_indexed = page_count,
            images_indexed = image_count,
            maps_indexed = map_count,
            tags_found = self.tags.len(),
            links_found,
            duration_ms = start_time.elapsed().as_millis(),
            "Full scan completed"
        );

        Ok(())
    }

    /// Handles a batch of file events efficiently.
    ///
    /// This method implements "event coalescing" to solve the Windows Atomic Write issue
    /// (where a file is reported as Deleted and then immediately Created/Modified).
    /// By calculating the *net effect* of the batch for each path before processing,
    /// we prevent the indexer from unnecessarily deleting and re-adding files.
    #[instrument(skip(self, events))]
    pub fn handle_event_batch(&mut self, events: &[FileEvent]) {
        if events.is_empty() {
            return;
        }

        // Track the final required operation for each path.
        // True = File exists (Update/Create). False = File gone (Delete).
        let mut path_states: HashMap<PathBuf, bool> = HashMap::new();

        for event in events {
            match event {
                FileEvent::Created(p) | FileEvent::FolderCreated(p) | FileEvent::Modified(p) => {
                    path_states.insert(p.clone(), true);
                }
                FileEvent::Deleted(p) | FileEvent::FolderDeleted(p) => {
                    path_states.insert(p.clone(), false);
                }
                FileEvent::Renamed { from, to } => {
                    path_states.insert(from.clone(), false);
                    path_states.insert(to.clone(), true);
                }
            }
        }

        // Apply changes based on the net state
        for (path, exists) in path_states {
            if exists {
                // If the file exists in the end state, update it (re-parse)
                // This covers Created, Modified, and the 'To' side of Renamed
                // It also implicitly recovers from the 'Deleted' side of an atomic write
                self.update_file(&path);
            } else {
                // If the file is gone in the end state, remove it
                self.remove_file(&path);
            }
        }

        // Always rebuild relations after a batch of changes to ensure backlinks are correct
        self.rebuild_relations();
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

    /// Updates or creates an index entry for a single file path.
    #[instrument(level = "debug", skip(self))]
    pub fn update_file(&mut self, path: &Path) {
        // Always remove the old entry first to ensure a clean update.
        // Note: We might remove an entry based on the raw path before canonicalization,
        // which is correct behavior if the path itself is changing.
        self.remove_file_from_index(path);

        // Parse and process the file
        let result = Self::process_path(path.to_path_buf());

        // Apply the result to the index.
        if let Some(asset) = result.asset {
            self.assets.insert(result.path.clone(), asset);
        }
        if let Some(error) = result.error {
            self.parse_errors.insert(result.path, error);
        }
    }

    /// Removes a file from the index.
    #[instrument(level = "debug", skip(self))]
    fn remove_file(&mut self, path: &Path) {
        self.remove_file_from_index(path);
    }

    /// Removes a single file from all relevant index maps.
    fn remove_file_from_index(&mut self, path: &Path) {
        self.assets.remove(path);
        self.parse_errors.remove(path);
    }

    /// Removes a folder and all its descendant assets from the index.
    #[instrument(level = "debug", skip(self))]
    fn remove_folder(&mut self, path: &Path) {
        self.assets
            .retain(|asset_path, _| !asset_path.starts_with(path));
        self.parse_errors
            .retain(|asset_path, _| !asset_path.starts_with(path));
    }

    /// Handles an in-memory rename of a file or folder.
    #[instrument(level = "debug", skip(self))]
    fn handle_rename(&mut self, from: &Path, to: &Path) {
        if to.is_dir() {
            // --- FOLDER RENAME ---
            let assets_to_move: Vec<_> = self
                .assets
                .keys()
                .filter(|p| p.starts_with(from))
                .cloned()
                .collect();
            for old_path in assets_to_move {
                self.remove_file_from_index(&old_path);
                let relative_path = old_path.strip_prefix(from).unwrap();
                let new_path = to.join(relative_path);
                self.update_file(&new_path);
            }
        } else {
            // --- FILE RENAME ---
            self.remove_file_from_index(from);
            self.update_file(to);
        }
    }

    /// Rebuilds all relationships (tags, graph, backlinks, and resolvers) from scratch.
    #[instrument(level = "info", skip(self))]
    pub fn rebuild_relations(&mut self) {
        // Create local state to build into.
        let mut new_link_resolver: HashMap<String, PathBuf> = HashMap::new();
        let mut new_media_resolver: HashMap<String, PathBuf> = HashMap::new();
        let mut new_tags: HashMap<String, HashSet<PathBuf>> = HashMap::new();
        let mut new_link_graph: HashMap<PathBuf, HashMap<PathBuf, Vec<Link>>> = HashMap::new();
        let mut new_backlinks: HashMap<PathBuf, HashSet<PathBuf>> = HashMap::new();
        let mut new_map_backlinks: HashMap<PathBuf, HashSet<PathBuf>> = HashMap::new();

        // --- PASS 1: Build resolver maps ---
        // This pass ensures that all potential link targets are known before we process any links.
        for path in self.assets.keys() {
            if is_markdown_file(path) {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    new_link_resolver.insert(stem.to_lowercase(), path.clone());
                }
            } else if is_image_file(path) {
                if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                    new_media_resolver.insert(filename.to_lowercase(), path.clone());
                }
            }
            // Future: else if is_audio_file(path) { ... }
        }

        // --- PASS 2: Build relationships using the resolvers ---
        // This pass can now safely assume that the resolvers are complete.
        for (path, asset) in &self.assets {
            match asset {
                VaultAsset::Page(page) => {
                    // Rebuild tag associations
                    for tag in &page.tags {
                        new_tags
                            .entry(tag.clone())
                            .or_default()
                            .insert(path.clone());
                    }

                    // Rebuild the link graph and calculate backlinks
                    for link in &page.links {
                        if let Some(target_path) =
                            new_link_resolver.get(&link.target.to_lowercase())
                        {
                            new_link_graph
                                .entry(path.clone())
                                .or_default()
                                .entry(target_path.clone())
                                .or_default()
                                .push(link.clone());
                            new_backlinks
                                .entry(target_path.clone())
                                .or_default()
                                .insert(path.clone());
                        }
                    }
                }
                VaultAsset::Map(config) => {
                    // Index map pins linking to pages
                    if let Some(pins) = &config.pins {
                        for pin in pins {
                            if let Some(target) = &pin.target_page {
                                if let Some(target_path) =
                                    new_link_resolver.get(&target.to_lowercase())
                                {
                                    new_map_backlinks
                                        .entry(target_path.clone())
                                        .or_default()
                                        .insert(path.clone());
                                }
                            }
                        }
                    }
                    // Index map regions linking to pages
                    if let Some(shapes) = &config.shapes {
                        for shape in shapes {
                            if let Some(target) = &shape.target_page {
                                if let Some(target_path) =
                                    new_link_resolver.get(&target.to_lowercase())
                                {
                                    new_map_backlinks
                                        .entry(target_path.clone())
                                        .or_default()
                                        .insert(path.clone());
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        // Apply the newly calculated backlinks to all pages.
        for (path, asset) in self.assets.iter_mut() {
            if let VaultAsset::Page(page) = asset {
                page.backlinks = new_backlinks.remove(path).unwrap_or_default();
            }
        }

        // Atomically swap the new state into place.
        let _ = mem::replace(&mut self.link_resolver, new_link_resolver);
        let _ = mem::replace(&mut self.media_resolver, new_media_resolver);
        let _ = mem::replace(&mut self.tags, new_tags);
        let _ = mem::replace(&mut self.link_graph, new_link_graph);
        let _ = mem::replace(&mut self.map_backlinks, new_map_backlinks);
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
                        if let Some(VaultAsset::Page(p)) = self.assets.get(path) {
                            Some(PageHeader {
                                path: p.path.clone(),
                                title: p.title.clone(),
                            })
                        } else {
                            None
                        }
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
            // Check for map file
            let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            if file_name.ends_with(".map.json") {
                FileType::Map
            } else {
                FileType::Markdown
            }
        };

        let children = if file_type == FileType::Directory {
            let mut entries = Vec::new();
            for entry in fs::read_dir(path)? {
                let entry = entry?;
                let child_path = entry.path();
                if let Some(file_name) = child_path.file_name().and_then(|n| n.to_str()) {
                    if file_name.starts_with('.') {
                        continue;
                    }
                    if child_path.is_dir()
                        || is_markdown_file(&child_path)
                        || is_image_file(&child_path)
                        || file_name.ends_with(".map.json")
                    {
                        entries.push(Self::build_tree_recursive(&child_path, file_name)?);
                    }
                }
            }
            // Sort children by:
            // 1. Directories first (based on Ord impl)
            // 2. Special folders (starting with '_') next
            // 3. All other items, sorted case-insensitively
            entries.sort_by(|a, b| {
                a.file_type
                    .cmp(&b.file_type) // 1. Directories
                    .then_with(|| {
                        // 2. Folders/files starting with '_' come first
                        let a_is_special = a.name.starts_with('_');
                        let b_is_special = b.name.starts_with('_');
                        // This is a reverse-order sort. In Rust, `false` < `true`.
                        // By comparing `b.cmp(a)`, a `false` value for `b` and a `true`
                        // value for `a` results in `Ordering::Less`, pushing `a`
                        // (the special file) to the top of the list.
                        b_is_special.cmp(&a_is_special)
                    })
                    // 3. Then sort all names case-insensitively
                    .then_with(|| nat_compare(&a.name, &b.name))
            });
            Some(entries)
        } else {
            None
        };

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
        for (source_path, asset) in &self.assets {
            if let VaultAsset::Page(page) = asset {
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

    /// Finds all broken image references in the vault.
    #[instrument(level = "debug", skip(self))]
    pub fn get_all_broken_images(&self) -> Result<Vec<BrokenImage>> {
        let mut broken_images_map: HashMap<String, HashSet<PageHeader>> = HashMap::new();

        for (source_path, asset) in &self.assets {
            if let VaultAsset::Page(page) = asset {
                for image_ref in &page.images {
                    // Normalize the image reference:
                    // 1. Convert to lowercase for case-insensitive lookup
                    // 2. Extract just the filename if it's a path (e.g. "assets/img.png" -> "img.png")
                    // This matches the behavior of `media_resolver` which keys by filename.
                    let target_key = Path::new(image_ref)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(image_ref)
                        .to_lowercase();

                    if !self.media_resolver.contains_key(&target_key) {
                        let source_header = PageHeader {
                            path: source_path.clone(),
                            title: page.title.clone(),
                        };
                        broken_images_map
                            .entry(image_ref.clone())
                            .or_default()
                            .insert(source_header);
                    }
                }
            }
        }

        let mut result: Vec<BrokenImage> = broken_images_map
            .into_iter()
            .map(|(target, sources_set)| {
                let mut sources: Vec<PageHeader> = sources_set.into_iter().collect();
                sources.sort_by(|a, b| nat_compare(&a.title, &b.title));
                BrokenImage { target, sources }
            })
            .collect();

        result.sort_by(|a, b| nat_compare(&a.target, &b.target));

        Ok(result)
    }

    /// Finds all pages with parsing errors.
    #[instrument(level = "debug", skip(self))]
    pub fn get_all_parse_errors(&self) -> Result<Vec<ParseError>> {
        let mut result: Vec<ParseError> = self
            .parse_errors
            .iter()
            .map(|(path, error)| ParseError {
                page: PageHeader {
                    title: file_stem_string(path),
                    path: path.clone(),
                },
                error: error.clone(),
            })
            .collect();

        // Sort the results alphabetically by page title for a consistent report.
        result.sort_by(|a, b| nat_compare(&a.page.title, &b.page.title));
        Ok(result)
    }

    /// Reads and parses a `.map.json` file from the vault.
    ///
    /// Validates that the path exists in the file index before reading,
    /// ensuring we only serve known, valid vault assets.
    pub fn get_map_config(&self, path: &str) -> Result<serde_json::Value> {
        let path_buf = PathBuf::from(path);

        // Security & Validity Check:
        if !self.assets.contains_key(&path_buf) {
            return Err(ChroniclerError::FileNotFound(path_buf));
        }

        // It is safe to read because the index only contains files within the vault root.
        let content = fs::read_to_string(&path_buf)?;
        let config: serde_json::Value = serde_json::from_str(&content)?;
        Ok(config)
    }
}
