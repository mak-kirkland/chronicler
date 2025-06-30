//! Markdown content processor.
//!
//! Extracts metadata, links, and frontmatter from files.

use crate::config::MAX_FILE_SIZE;
use crate::error::{ChroniclerError, Result};
use crate::models::{Link, LinkPosition, Page};
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::LazyLock;
use tracing::instrument;

// Captures: 1: target, 2: section (optional), 3: alias (optional)
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
#[instrument(skip(path), fields(path = %path.display()), level = "debug", ret(level = "debug"))]
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
    let links = extract_wikilinks(&content, markdown_body);
    let title = extract_title(&frontmatter, path);

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
pub fn extract_frontmatter(content: &str) -> (&str, &str) {
    // Must start with frontmatter delimiter
    let Some(after_opening) = content.strip_prefix("---\n") else {
        return ("", content);
    };

    // Find closing delimiter
    let Some(closing_pos) = after_opening.find("\n---") else {
        return ("", content);
    };

    let frontmatter = &after_opening[..closing_pos];
    let body_start = after_opening[closing_pos..].strip_prefix("\n---").unwrap();

    // Closing delimiter must be followed by newline, EOF, or only whitespace
    if body_start.is_empty() || body_start.starts_with('\n') {
        let body = body_start.strip_prefix('\n').unwrap_or(body_start);
        return (frontmatter, body);
    }

    ("", content)
}

/// Parses YAML frontmatter string into a JSON Value.
pub fn parse_frontmatter(frontmatter_str: &str, path: &Path) -> Result<serde_json::Value> {
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

/// A helper to convert a byte offset to a 1-based line and column number.
fn offset_to_line_col(content: &str, byte_offset: usize) -> LinkPosition {
    let mut line = 1;
    let mut line_start_byte_offset = 0;

    // Iterate through character boundaries to handle multi-byte UTF-8 chars correctly
    for (char_byte_offset, ch) in content.char_indices() {
        if char_byte_offset >= byte_offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            line_start_byte_offset = char_byte_offset + ch.len_utf8();
        }
    }

    // Calculate column by counting characters (not bytes) from start of line
    let line_content = &content[line_start_byte_offset..byte_offset];
    let column = line_content.chars().count() + 1;

    LinkPosition { line, column }
}

// TODO: maybe extract them _before_ the YAML frontmatter to allow links in the infobox
/// Extracts wikilinks from markdown content.
fn extract_wikilinks(full_content: &str, body: &str) -> Vec<Link> {
    // Calculate the byte offset where the body starts within full_content
    let body_start_offset = full_content.len() - body.len();

    WIKILINK_RE
        .captures_iter(body)
        .map(|cap| {
            // The match for the whole pattern `[[...]]` is at index 0.
            let full_match = cap.get(0).unwrap();
            // Adjust the offset to be relative to full_content instead of body
            let absolute_offset = body_start_offset + full_match.start();
            let position = Some(offset_to_line_col(full_content, absolute_offset));
            let target = cap.get(1).unwrap().as_str().to_string();
            let section = cap.get(2).map(|m| m.as_str().to_string());
            let alias = cap.get(3).map(|m| m.as_str().to_string());
            Link {
                target,
                section,
                alias,
                position,
            }
        })
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

#[cfg(test)]
mod tests {
    use super::*; // Import everything from the parent module (parser)
    use std::collections::HashSet;
    use tempfile::tempdir;

    #[test]
    fn test_parse_file_with_full_frontmatter() -> Result<()> {
        let content = r#"---
title: "My Test Page"
tags:
  - character
  - location
---
Hello, this is the body. It contains a [[Link To Another Page]].
"#;
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test_page.md");
        fs::write(&file_path, content).unwrap();

        let page = parse_file(&file_path).unwrap();

        assert_eq!(page.title, "My Test Page");
        assert_eq!(
            page.tags,
            HashSet::from(["character".to_string(), "location".to_string()])
        );
        assert_eq!(page.links.len(), 1);
        assert_eq!(page.links[0].target, "Link To Another Page");
        assert!(page.frontmatter.get("title").is_some());

        Ok(())
    }

    #[test]
    fn test_parse_file_no_frontmatter() -> Result<()> {
        let content = r#"
This page has no frontmatter.
It just has a [[Simple Link]].
"#;
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("no_frontmatter.md");
        fs::write(&file_path, content).unwrap();

        let page = parse_file(&file_path).unwrap();

        // Title should fall back to the file stem
        assert_eq!(page.title, "no_frontmatter");
        // Tags should be empty
        assert!(page.tags.is_empty());
        // Link should still be parsed
        assert_eq!(page.links.len(), 1);
        assert_eq!(page.links[0].target, "Simple Link");
        // Frontmatter should be JSON null
        assert!(page.frontmatter.is_null());

        Ok(())
    }

    #[test]
    fn test_extract_wikilinks_all_variants() {
        let content = r#"
This file tests various link formats.
- A standard link: [[Target Page]]
- A link with an alias: [[Another Page|Display Text]]
- A link to a section: [[Third Page#Section Header]]
- A link with both: [[Fourth Page#Some Section|Alias Text]]
- A link in the middle of a sentence [[Fifth Page]] like this.
"#;
        // Here we can call the private function `extract_wikilinks`
        let (_frontmatter_str, body) = extract_frontmatter(content);
        let links = extract_wikilinks(content, body);

        assert_eq!(links.len(), 5);

        // Corrected column numbers
        assert_eq!(
            links[0],
            Link {
                target: "Target Page".to_string(),
                section: None,
                alias: None,
                position: Some(LinkPosition {
                    line: 3,
                    column: 20
                })
            }
        );

        assert_eq!(
            links[1],
            Link {
                target: "Another Page".to_string(),
                section: None,
                alias: Some("Display Text".to_string()),
                position: Some(LinkPosition {
                    line: 4,
                    column: 25
                })
            }
        );

        assert_eq!(
            links[2],
            Link {
                target: "Third Page".to_string(),
                section: Some("Section Header".to_string()),
                alias: None,
                position: Some(LinkPosition {
                    line: 5,
                    column: 24
                })
            }
        );

        assert_eq!(
            links[3],
            Link {
                target: "Fourth Page".to_string(),
                section: Some("Some Section".to_string()),
                alias: Some("Alias Text".to_string()),
                position: Some(LinkPosition {
                    line: 6,
                    column: 21
                })
            }
        );
        assert_eq!(
            links[4],
            Link {
                target: "Fifth Page".to_string(),
                section: None,
                alias: None,
                position: Some(LinkPosition {
                    line: 7,
                    column: 38
                })
            }
        );
    }
}
