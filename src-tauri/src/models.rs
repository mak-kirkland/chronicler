//! Core data structures.
//!
//! Defines the page and file tree representations.

use crate::utils::serialize_pathbuf_as_web_str;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::HashSet;
use std::path::PathBuf;

/// Partial representation of a Map Pin for indexing purposes.
/// We only need the target page to build relationships.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapPin {
    #[serde(rename = "targetPage")]
    pub target_page: Option<String>,
    // We can ignore x, y, icon, etc. for the backend index to save memory.
}

/// Partial representation of a Map Region (Shape) for indexing purposes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapRegion {
    #[serde(rename = "targetPage")]
    pub target_page: Option<String>,
}

/// Partial representation of the Map Configuration file.
/// Used to extract links without loading the entire heavy JSON into memory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapConfig {
    pub title: String,
    pub pins: Option<Vec<MapPin>>,
    pub shapes: Option<Vec<MapRegion>>,
}

/// Represents any uniquely identifiable asset within the vault.
/// This enum is the core of the unified indexing strategy, allowing the indexer
/// to treat all file types generically while still storing specific data where needed.
/// It can be easily extended with new variants like `Audio` in the future.
#[derive(Debug, Clone)]
pub enum VaultAsset {
    /// A directory in the vault. Stored to enable building the file tree
    /// entirely from the in-memory index without filesystem I/O.
    Directory,
    /// A Markdown page with all its parsed metadata.
    /// The `Page` is boxed to prevent the enum from becoming too large,
    /// which would make smaller variants like `Image` inefficient to store.
    Page(Box<Page>),
    /// An image file. For now, we only need to know it exists; its path is the key.
    Image,
    /// An interactive map configuration file (.cmap).
    /// Stores the parsed config to allow backlink calculations.
    Map(Box<MapConfig>),
}

/// Represents the location of a link within a source file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct LinkPosition {
    pub line: usize,
    pub column: usize,
}

/// Represents a wikilink within a page.
///
/// This structure holds the parsed components of a link like `[[target#section|alias]]`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct Link {
    /// The target page name of the link (e.g., "My Page").
    pub target: String,
    /// The optional header section of the link (e.g., "Some Header").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub section: Option<String>,
    /// The optional alias (display text) of the link.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
    /// The position of the link in the source file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<LinkPosition>,
}

/// Represents a single Markdown file (a "page") in the vault.
/// This struct holds all the metadata we extract from a file, which is
/// then used to power features like linking, tagging, and infoboxes.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Page {
    /// The absolute path to the Markdown file.
    pub path: PathBuf,
    /// The title of the page. Often derived from the filename or frontmatter.
    pub title: String,
    /// A set of all tags found in the file (e.g., "#character").
    /// Using a HashSet prevents duplicate tags.
    pub tags: HashSet<String>,
    /// A vector of all outgoing links from this page to other pages (e.g., "[[Another Page]]").
    /// Using a Vec allows for duplicate links, which can be used to determine link "strength".
    pub links: Vec<Link>,
    /// A list of images embedded in this page (e.g., `![[img.png]]`, `![alt](img.png)`).
    /// Stores the raw target string (filename or path).
    pub images: Vec<String>,
    /// A set of all incoming links (backlinks) from other pages.
    /// This is calculated by the Indexer, not read from the file itself.
    pub backlinks: HashSet<PathBuf>,
    /// The parsed YAML frontmatter of the file.
    /// `serde_json::Value` is used to allow for flexible, unstructured data,
    /// which is perfect for user-defined infoboxes.
    pub frontmatter: serde_json::Value,
}

/// Represents the category of a node in the file system tree.
///
/// This provides a type-safe way to distinguish between directories and different
/// kinds of files.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub enum FileType {
    /// A directory node that can contain other nodes.
    Directory,
    /// A Markdown file (`.md`), which is treated as a page.
    Markdown,
    /// A supported image file (e.g., `.png`, `.jpg`).
    Image,
    /// An interactive map configuration (`.cmap`).
    Map,
}

/// Implements partial ordering for `FileType`.
///
/// This implementation is straightforward because `FileType` has a total order;
/// no two variants are incomparable.
impl PartialOrd for FileType {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Implements total ordering for `FileType` to define a custom sort order.
///
/// This implementation ensures that `Directory` variants are always considered
/// "less than" file variants (`Markdown`, `Image`, `Map`), causing them to appear
/// first when a list of `FileNode`s is sorted.
impl Ord for FileType {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self, other) {
            // A Directory is "less than" any file, so it comes first when sorting.
            (FileType::Directory, FileType::Directory) => Ordering::Equal,
            (FileType::Directory, _) => Ordering::Less,
            (_, FileType::Directory) => Ordering::Greater,
            // All other file types are considered equal in sorting rank.
            _ => Ordering::Equal,
        }
    }
}

/// Represents a node in the file system tree.
/// This is used to build a serializable representation of the vault's
/// directory structure to display in the frontend.
#[derive(Debug, Serialize, Clone)]
pub struct FileNode {
    pub name: String,
    #[serde(serialize_with = "serialize_pathbuf_as_web_str")]
    pub path: PathBuf,
    pub file_type: FileType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

/// A lightweight representation of a page containing only the data needed for list views.
/// This is used to efficiently send lists of pages to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct PageHeader {
    pub title: String,
    #[serde(serialize_with = "serialize_pathbuf_as_web_str")]
    pub path: PathBuf,
}

/// A lightweight representation of a map, used for the "associated maps" list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapLink {
    pub title: String,
    #[serde(serialize_with = "serialize_pathbuf_as_web_str")]
    pub path: PathBuf,
}

/// A lightweight representation of a backlink, including the reference count.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Backlink {
    pub title: String,
    #[serde(serialize_with = "serialize_pathbuf_as_web_str")]
    pub path: PathBuf,
    pub count: usize,
}

/// Represents a single entry in the Table of Contents.
#[derive(Debug, Serialize, Clone)]
pub struct TocEntry {
    /// The hierarchical number of the entry (e.g., "1.2").
    pub number: String,
    /// The text content of the header.
    pub text: String,
    /// The level of the header (1-6).
    pub level: u32,
    /// The URL-friendly ID generated for the header.
    pub id: String,
}

/// A structure containing the fully processed data for a page, ready for frontend display.
#[derive(Debug, Serialize, Clone)]
pub struct RenderedPage {
    /// The frontmatter, with any wikilinks inside its values replaced by HTML tags.
    pub processed_frontmatter: Value,
    /// The portion of the rendered HTML that comes *before* the first header.
    pub html_before_toc: String,
    /// The portion of the rendered HTML that comes *from* the first header onwards.
    pub html_after_toc: String,
    /// The generated Table of Contents for the page.
    pub toc: Vec<TocEntry>,
}

/// A comprehensive data structure for the file view. This is a "View Model"
/// that combines data from the indexer and the renderer into a single package
/// for the frontend.
#[derive(Debug, Serialize, Clone)]
pub struct FullPageData {
    pub raw_content: String,
    pub rendered_page: RenderedPage,
    pub backlinks: Vec<Backlink>,
    /// Maps that contain pins or regions linking to this page.
    pub associated_maps: Vec<MapLink>,
}

/// Represents a broken link report, aggregating all pages that link to a non-existent target.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokenLink {
    /// The target name of the link that could not be resolved.
    pub target: String,
    /// A list of all pages that contain a link to this target.
    pub sources: Vec<PageHeader>,
}

/// Represents a broken image report, aggregating all pages that embed a non-existent image.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokenImage {
    /// The filename or path of the image that could not be found.
    pub target: String,
    /// A list of all pages that embed this image.
    pub sources: Vec<PageHeader>,
}

/// Represents a single entry in the parse error report.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseError {
    /// The header of the page that failed to parse.
    pub page: PageHeader,
    /// The detailed error message.
    pub error: String,
}
