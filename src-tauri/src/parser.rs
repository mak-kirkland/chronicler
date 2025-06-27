//! Markdown content processor.
//!
//! Extracts metadata, links, and frontmatter from files.

use crate::config::MAX_FILE_SIZE;
use crate::error::{ChroniclerError, Result};
use crate::models::Page;
use pulldown_cmark::{Event, Parser, Tag, TagEnd};
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::LazyLock;

// Compile regexes once at module level for better organization and reusability
static WIKILINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[\[([^|\]]+)(?:\|[^\]]+)?\]\]").unwrap());
static TAG_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"#([a-zA-Z0-9_-]+)").unwrap());

/// Parses a single Markdown file to extract its metadata (frontmatter, tags, links).
///
/// # Arguments
/// * `path` - The path to the Markdown file to parse.
///
/// # Returns
/// A `Result` containing the parsed `Page` or a `ChroniclerError`.
pub fn parse_file(path: &Path) -> Result<Page> {
    // Error if file size is too large
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

    let frontmatter = if frontmatter_str.is_empty() {
        serde_json::Value::Null
    } else {
        serde_yaml::from_str(frontmatter_str)?
    };

    let mut tags = HashSet::new();
    let mut links = HashSet::new();
    let mut in_code_block = false;

    // Use pulldown-cmark to iterate over Markdown events.
    let parser = Parser::new(markdown_body);
    for event in parser {
        match event {
            Event::Start(Tag::CodeBlock(_)) => in_code_block = true,
            Event::End(TagEnd::CodeBlock) => in_code_block = false,
            Event::Text(text) if !in_code_block => {
                // Extract tags from text nodes that are not inside code blocks.
                for cap in TAG_RE.captures_iter(&text) {
                    tags.insert(cap[1].to_string());
                }
                // Extract links from text nodes.
                for cap in WIKILINK_RE.captures_iter(&text) {
                    links.insert(cap[1].to_string());
                }
            }
            _ => {}
        }
    }

    // Determine the page title
    let title = frontmatter
        .get("title")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| {
            path.file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        });

    Ok(Page {
        path: path.to_path_buf(),
        title,
        tags,
        links,
        backlinks: HashSet::new(),
        frontmatter,
    })
}

/// Splits a file's content into its YAML frontmatter and the main Markdown body.
/// Unicode-safe.
fn extract_frontmatter(content: &str) -> (&str, &str) {
    if !content.starts_with("---\n") {
        return ("", content);
    }

    let after_start = &content[4..];

    // Look for "\n---\n" (closing delimiter with content after)
    if let Some(end_pos) = after_start.find("\n---\n") {
        return (&after_start[..end_pos], &after_start[end_pos + 5..]);
    }

    // Look for "\n---" at end of file or followed only by whitespace
    if let Some(end_pos) = after_start.find("\n---") {
        let after_closing = &after_start[end_pos + 4..];
        if after_closing.chars().all(|c| c.is_whitespace()) {
            return (&after_start[..end_pos], after_closing.trim_start());
        }
    }

    // No valid closing delimiter found
    ("", content)
}
