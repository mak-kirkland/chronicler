//! Core data structures.
//!
//! Defines the page and file tree representations.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;

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
    /// A set of all outgoing links from this page to other pages (e.g., "[[Another Page]]").
    pub links: HashSet<String>,
    /// A set of all incoming links (backlinks) from other pages.
    /// This is calculated by the Indexer, not read from the file itself.
    pub backlinks: HashSet<PathBuf>,
    /// The parsed YAML frontmatter of the file.
    /// `serde_json::Value` is used to allow for flexible, unstructured data,
    /// which is perfect for user-defined infoboxes.
    pub frontmatter: serde_json::Value,
}

/// Represents a node in the file system tree.
/// This is used to build a serializable representation of the vault's
/// directory structure to display in the frontend.
#[derive(Debug, Serialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: PathBuf,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}
