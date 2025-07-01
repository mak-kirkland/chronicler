//! Wiklink extractor
//!
//! Extracts wikilinks from text, creating Link structs

use crate::models::{Link, LinkPosition};
use regex::Regex;
use std::sync::LazyLock;

/// Shared wikilink regex pattern.
/// Captures: 1: target, 2: section (optional), 3: alias (optional)
/// Format: [[target#section|alias]]
pub static WIKILINK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[\[([^\[\]\|#]+)(?:#([^\[\]\|]+))?(?:\|([^\[\]]+))?\]\]").unwrap()
});

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

/// Extracts wikilinks from markdown content.
pub fn extract_wikilinks(content: &str) -> Vec<Link> {
    WIKILINK_RE
        .captures_iter(content)
        .map(|cap| {
            // The match for the whole pattern `[[...]]` is at index 0.
            let full_match = cap.get(0).unwrap();
            let offset = full_match.start();
            let position = Some(offset_to_line_col(content, offset));
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

#[cfg(test)]
mod tests {
    use super::*; // Import everything from the parent module

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
        let links = extract_wikilinks(content);

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
