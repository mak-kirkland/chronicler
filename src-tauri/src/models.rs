//! Core data structures.
//!
//! Defines the page and file tree representations.

use serde::{Deserialize, Serialize, Serializer};
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::HashSet;
use std::path::PathBuf;

/// A custom serialization function for `PathBuf` that guarantees forward slashes.
///
/// This function ensures that when a `PathBuf` is sent to the frontend, it's
/// always in a web-standard format with forward slashes (`/`), regardless of the
/// operating system. This creates a consistent and predictable API contract with
/// the TypeScript frontend.
fn serialize_pathbuf_as_web_str<S>(path: &PathBuf, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let path_str = path.to_string_lossy().to_string();
    #[cfg(windows)]
    let web_path = path_str.replace('\\', "/");
    #[cfg(not(windows))]
    let web_path = path_str;
    serializer.serialize_str(&web_path)
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
/// "less than" file variants (`Markdown`, `Image`), causing them to appear
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
}

/// Represents a broken link report, aggregating all pages that link to a non-existent target.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokenLink {
    /// The target name of the link that could not be resolved.
    pub target: String,
    /// A list of all pages that contain a link to this target.
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
