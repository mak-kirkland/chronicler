//! Markdown content processor.
//!
//! Extracts metadata, links, and frontmatter from files.

use crate::config::MAX_FILE_SIZE;
use crate::error::{ChroniclerError, Result};
use crate::models::Page;
use log::debug;
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::LazyLock;

// Compile regexes once at module level for better organization and reusability
static WIKILINK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[\[([^\[\]\|#]+)(?:#([^\[\]\|]+))?(?:\|([^\[\]]+))?\]\]").unwrap()
});

/// Parses a single Markdown file to extract its metadata (frontmatter, tags, links).
///
/// # Arguments
/// * `path` - The path to the Markdown file to parse.
///
/// # Returns
/// A `Result` containing the parsed `Page` or a `ChroniclerError`.
pub fn parse_file(path: &Path) -> Result<Page> {
    // Check file size limit
    let metadata = fs::metadata(path)?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(ChroniclerError::FileTooLarge {
            path: path.to_path_buf(),
            size: metadata.len(),
            max_size: MAX_FILE_SIZE,
        });
    }

    let content = fs::read_to_string(path)?;
    let (frontmatter_str, markdown_body) = extract_frontmatter(&content);

    // Parse frontmatter
    let frontmatter = parse_frontmatter(frontmatter_str, path)?;

    // Extract metadata
    let tags = extract_tags_from_frontmatter(&frontmatter);
    let links = extract_wikilinks(markdown_body);
    let title = extract_title(&frontmatter, path);

    debug!(
        "Page {} parsed. Tags: {:#?}, Links: {:#?}",
        title, tags, links
    );

    Ok(Page {
        path: path.to_path_buf(),
        title,
        tags,
        links,
        backlinks: HashSet::new(),
        frontmatter,
    })
}

/// Extracts YAML frontmatter from markdown content.
/// Returns (frontmatter, body) where frontmatter is empty if none found.
///
/// This function is Unicode-safe and handles multibyte characters correctly.
fn extract_frontmatter(content: &str) -> (&str, &str) {
    // Must start with frontmatter delimiter
    let Some(after_opening) = content.strip_prefix("---\n") else {
        return ("", content);
    };

    // Find closing delimiter
    let Some(closing_pos) = after_opening.find("\n---") else {
        return ("", content);
    };

    let frontmatter = &after_opening[..closing_pos];
    let after_closing = &after_opening[closing_pos..].strip_prefix("\n---").unwrap();

    // Closing delimiter must be followed by newline, EOF, or only whitespace
    if after_closing.is_empty() || after_closing.starts_with('\n') {
        let body = after_closing.strip_prefix('\n').unwrap_or(after_closing);
        return (frontmatter, body);
    }

    ("", content)
}

/// Parses YAML frontmatter string into a JSON Value.
fn parse_frontmatter(frontmatter_str: &str, path: &Path) -> Result<serde_json::Value> {
    if frontmatter_str.is_empty() {
        return Ok(serde_json::Value::Null);
    }

    serde_yaml::from_str(frontmatter_str).map_err(|e| ChroniclerError::YamlParseError {
        source: e,
        path: path.to_path_buf(),
    })
}

/// Extracts tags from frontmatter.
fn extract_tags_from_frontmatter(frontmatter: &serde_json::Value) -> HashSet<String> {
    frontmatter
        .get("tags")
        .and_then(|v| v.as_array())
        .into_iter()
        .flatten()
        .filter_map(|tag| tag.as_str())
        .map(String::from)
        .collect()
}

/// Extracts wikilinks from markdown content.
fn extract_wikilinks(content: &str) -> HashSet<String> {
    WIKILINK_RE
        .captures_iter(content)
        .filter_map(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
        .collect()
}

/// Determines the page title from frontmatter or filename.
fn extract_title(frontmatter: &serde_json::Value, path: &Path) -> String {
    frontmatter
        .get("title")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| {
            path.file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        })
}
