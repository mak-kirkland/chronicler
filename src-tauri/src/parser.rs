//! Markdown content processor.
//!
//! Extracts metadata, links, and frontmatter from files.

use crate::config::MAX_FILE_SIZE;
use crate::error::{ChroniclerError, Result};
use crate::models::{Link, Page};
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
    let title = extract_title(&frontmatter, path);

    // Extract links
    let mut links = extract_wikilinks(&content);

    // Extract images and clean up links
    let images = extract_images_and_clean_links(&content, &frontmatter, &mut links);

    Ok(Page {
        path: path.to_path_buf(),
        title,
        tags,
        links,
        images,
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
    // 1. Check for opening delimiter (LF or CRLF)
    let after_opening = if let Some(rest) = content.strip_prefix("---\n") {
        rest
    } else if let Some(rest) = content.strip_prefix("---\r\n") {
        rest
    } else {
        return ("", content);
    };

    // 2. Find closing delimiter
    // We look for `\n---` which works for both LF and CRLF files (since CRLF contains LF).
    let Some(closing_rel_pos) = after_opening.find("\n---") else {
        return ("", content);
    };

    // 3. Extract frontmatter and trim potential trailing '\r' (from CRLF)
    let raw_frontmatter = &after_opening[..closing_rel_pos];
    let frontmatter = if let Some(trimmed) = raw_frontmatter.strip_suffix('\r') {
        trimmed
    } else {
        raw_frontmatter
    };

    // 4. Locate body start
    // The `closing_rel_pos` points to the `\n` in `\n---`.
    // We need to skip `\n---` (length 4) and then check for the following newline.
    let rest_after_delimiter = &after_opening[closing_rel_pos + 4..];

    let body = if let Some(b) = rest_after_delimiter.strip_prefix('\n') {
        b
    } else if let Some(b) = rest_after_delimiter.strip_prefix("\r\n") {
        b
    } else {
        // EOF or no newline after delimiter
        rest_after_delimiter
    };

    (frontmatter, body)
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

/// Scans the content for image references and removes image-like targets from the links list.
///
/// Handles:
/// 1. Frontmatter `image` field.
/// 2. Wikilink embeds `![[image.png]]`.
/// 3. Standard Markdown images `![alt](image.png)`.
/// 4. HTML image tags `<img src="image.png">`.
fn extract_images_and_clean_links(
    content: &str,
    frontmatter: &serde_json::Value,
    links: &mut Vec<Link>,
) -> Vec<String> {
    let mut images = Vec::new();

    // 1. Frontmatter image
    if let Some(img) = frontmatter.get("image").and_then(|v| v.as_str()) {
        if !img.trim().is_empty() {
            images.push(img.to_string());
        }
    }

    // Manual scanning for image syntax to avoid regex dependencies for now.
    // This loops through the content finding specific patterns.

    // 2. Wikilink embeds `![[...]]`
    let mut cursor = 0;
    while let Some(start_idx) = content[cursor..].find("![[") {
        let abs_start = cursor + start_idx;
        if let Some(end_idx) = content[abs_start..].find("]]") {
            let abs_end = abs_start + end_idx;
            // +3 to skip `![[`
            let inner = &content[abs_start + 3..abs_end];
            // Split off alias if present (e.g. `![[image.png|alias]]`)
            let target = inner.split('|').next().unwrap_or(inner).trim();
            if !target.is_empty() {
                images.push(target.to_string());
            }
            cursor = abs_end + 2;
        } else {
            cursor = abs_start + 3;
        }
    }

    // 3. Standard Markdown images `![...](...)`
    cursor = 0;
    while let Some(start_idx) = content[cursor..].find("![") {
        let abs_start = cursor + start_idx;
        // Check for wikilink embed start `![[` and skip it here to avoid double counting
        // (though `![[` is handled above, avoiding conflict is safer)
        if content[abs_start..].starts_with("![[") {
            cursor = abs_start + 3;
            continue;
        }

        if let Some(bracket_end) = content[abs_start..].find(']') {
            let abs_bracket_end = abs_start + bracket_end;
            // Expect `(` immediately after `]`
            if content[abs_bracket_end + 1..].starts_with('(') {
                if let Some(paren_end) = content[abs_bracket_end + 2..].find(')') {
                    let abs_paren_end = abs_bracket_end + 2 + paren_end;
                    let inner = &content[abs_bracket_end + 2..abs_paren_end];
                    // Handle title attribute `![alt](url "title")` - take first part
                    let url = inner.split_whitespace().next().unwrap_or(inner).trim();
                    if !url.is_empty() {
                        images.push(url.to_string());
                    }
                    cursor = abs_paren_end + 1;
                    continue;
                }
            }
        }
        cursor = abs_start + 2;
    }

    // 4. HTML img tags `<img ... src="..." ...>`
    cursor = 0;
    while let Some(start_idx) = content[cursor..].find("<img") {
        let abs_start = cursor + start_idx;
        if let Some(tag_end) = content[abs_start..].find('>') {
            let abs_tag_end = abs_start + tag_end;
            let tag_content = &content[abs_start..abs_tag_end];

            // Simple attribute parser
            if let Some(src_start) = tag_content.find("src=") {
                let after_src = &tag_content[src_start + 4..];
                // Check for quote type
                let quote = after_src.chars().next();
                if let Some(q) = quote {
                    if q == '"' || q == '\'' {
                        if let Some(close_quote) = after_src[1..].find(q) {
                            let url = &after_src[1..close_quote + 1];
                            if !url.is_empty() {
                                images.push(url.to_string());
                            }
                        }
                    }
                }
            }
            cursor = abs_tag_end + 1;
        } else {
            cursor = abs_start + 4;
        }
    }

    // CLEANUP: Filter the existing `links` vector.
    // If a link target ends with a common image extension, remove it.
    // This fixes the issue where linked images show up as broken page links.
    // We also remove links that are already identified as strict embeds to be safe.
    let image_extensions = [
        "png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "tiff", "ico",
    ];

    links.retain(|link| {
        let target_lower = link.target.to_lowercase();

        // If it was detected as an embed (e.g. ![[image.png]]), remove it from links.
        // (Note: `images` contains raw targets, `link.target` might be slightly different if normalized,
        // but strict string match is a good first pass).
        if images
            .iter()
            .any(|img| img.eq_ignore_ascii_case(&link.target))
        {
            return false;
        }

        // If it looks like an image file, remove it from page links.
        for ext in image_extensions {
            if target_lower.ends_with(&format!(".{}", ext)) {
                return false;
            }
        }

        true
    });

    images
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

    #[test]
    fn test_parse_file_with_images() -> Result<()> {
        let content = r#"---
image: "cover.jpg"
---
Here is an embed: ![[embed.png]]
Here is a markdown image: ![Alt Text](markdown.png)
Here is an html image: <img src="html.gif" alt="HTML">
Here is a normal link to an image (should not be in links): [[linked.webp]]
Here is a normal link to a page: [[Another Page]]
"#;
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test_images.md");
        fs::write(&file_path, content).unwrap();

        let page = parse_file(&file_path).unwrap();

        // Check images
        assert_eq!(page.images.len(), 4);
        assert!(page.images.contains(&"cover.jpg".to_string()));
        assert!(page.images.contains(&"embed.png".to_string()));
        assert!(page.images.contains(&"markdown.png".to_string()));
        assert!(page.images.contains(&"html.gif".to_string()));

        // Check links - should only contain "Another Page"
        // "linked.webp" should be filtered out because of extension
        assert_eq!(page.links.len(), 1);
        assert_eq!(page.links[0].target, "Another Page");

        Ok(())
    }

    #[test]
    fn test_extract_frontmatter_windows_crlf() {
        // Manually construct a string with CRLF (\r\n) line endings
        // Structure:
        // ---
        // title: Windows
        // ---
        // Body starts here
        let content = "---\r\ntitle: Windows\r\n---\r\nBody starts here";

        let (frontmatter, body) = extract_frontmatter(content);

        // 1. Verify frontmatter is clean (no trailing \r)
        assert_eq!(frontmatter, "title: Windows");

        // 2. Verify body starts correctly (newline after --- is consumed)
        assert_eq!(body, "Body starts here");

        // Additional Check: Ensure it preserves internal CRLF in frontmatter values if needed,
        // but doesn't break the split.
        let content_multiline = "---\r\nkey: value\r\nlist:\r\n  - item\r\n---\r\n\r\n# Body";
        let (fm, bd) = extract_frontmatter(content_multiline);

        assert_eq!(fm, "key: value\r\nlist:\r\n  - item");
        // Should preserve the blank line before the header (first \r\n consumed by parser, second remains)
        assert_eq!(bd, "\r\n# Body");
    }
}
