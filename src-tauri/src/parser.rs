//! Markdown content processor.
//!
//! Extracts metadata, links, and frontmatter from files.

use crate::config::MAX_FILE_SIZE;
use crate::error::{ChroniclerError, Result};
use crate::models::Page;
use crate::wikilink::extract_wikilinks;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use tracing::instrument;

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
    let (frontmatter_str, _markdown_body) = extract_frontmatter(&content);

    // Parse frontmatter
    let frontmatter = parse_frontmatter(frontmatter_str, path)?;

    // Extract metadata
    let tags = extract_tags_from_frontmatter(&frontmatter);
    let links = extract_wikilinks(&content);
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
///
/// This function is Unicode-safe and handles multibyte characters correctly.
///
/// Returns a tuple `(frontmatter, body)`, where `frontmatter` is the raw string
/// content between the `---` delimiters, or an empty string if none is found.
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

    // Step 1: Parse into serde_yaml::Value.
    // serde_yaml's specific Value parser enforces unique keys by default.
    let yaml_value: serde_yaml::Value =
        serde_yaml::from_str(frontmatter_str).map_err(|e| ChroniclerError::YamlParseError {
            source: e,
            path: path.to_path_buf(),
        })?;

    // Step 2: Convert to serde_json::Value.
    // This maintains compatibility with the rest of the application which uses JSON values.
    serde_json::to_value(yaml_value).map_err(ChroniclerError::from)
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
    use crate::error::ChroniclerError;
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
    fn test_parse_frontmatter_duplicate_keys() {
        let content = r#"---
title: "Duplicate Key Test"
tags: ["a"]
tags: ["b"]
---
Body
"#;
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("duplicate.md");
        fs::write(&file_path, content).unwrap();

        let result = parse_file(&file_path);

        // This confirms that serde_yaml::Value's strict parsing is working
        assert!(
            result.is_err(),
            "Parser should have errored on duplicate keys"
        );

        match result {
            Err(ChroniclerError::YamlParseError { source, .. }) => {
                let msg = source.to_string();
                // serde_yaml's error message for duplicates usually explicitly mentions it
                assert!(
                    msg.to_lowercase().contains("duplicate") || msg.contains("key"),
                    "Error message should mention duplicate keys, got: {}",
                    msg
                );
            }
            _ => panic!(
                "Expected YamlParseError for duplicate keys, got {:?}",
                result
            ),
        }
    }
}
