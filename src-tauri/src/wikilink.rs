//! Wiklink extractor
//!
//! Extracts wikilinks from text, creating Link structs

use crate::models::{Link, LinkPosition};
use regex::{Captures, Regex};
use std::sync::LazyLock;

/// Shared wikilink regex pattern.
/// Captures: 1: target, 2: section (optional), 3: alias (optional)
/// Format: [[target#section|alias]]
///
/// The target is allowed to be empty so that target-less section links like
/// `[[#Heading]]` (a link to a heading within the *current* page) are matched.
/// Consumers must treat an empty target as a same-page reference.
pub static WIKILINK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[\[([^\[\]\|#]*)(?:#([^\[\]\|#]+))?(?:\|([^\[\]]+))?\]\]").unwrap()
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

/// The prefix that turns a wikilink into a map link: `[[map:Name#Place|alias]]`.
pub const MAP_LINK_PREFIX: &str = "map:";

/// Whether a wikilink target is a map link (`map:…`, any case), including an
/// empty one like `[[map:]]`. Such targets are never page links.
pub fn is_map_link_target(target: &str) -> bool {
    target
        .trim_start()
        .get(..MAP_LINK_PREFIX.len())
        .is_some_and(|p| p.eq_ignore_ascii_case(MAP_LINK_PREFIX))
}

/// The map name of a `map:Name` target, trimmed. `None` for a page target
/// and for a map link with no name.
pub fn map_link_name(target: &str) -> Option<&str> {
    if !is_map_link_target(target) {
        return None;
    }
    let name = target.trim_start()[MAP_LINK_PREFIX.len()..].trim();
    (!name.is_empty()).then_some(name)
}

/// A wikilink's optional `#section` or `|alias` capture, trimmed. A blank one
/// (`[[map:Eldoria# ]]`) counts as absent rather than as an empty part.
pub fn optional_part<'a>(caps: &Captures<'a>, group: usize) -> Option<&'a str> {
    caps.get(group)
        .map(|m| m.as_str().trim())
        .filter(|part| !part.is_empty())
}

/// Extracts the wikilinks in `content` in one pass, as (page links, map
/// links). A map link's `target` is the map name without the prefix, and its
/// `section` is the place.
///
/// Neither list has target-less links (e.g. `[[#Heading]]`), which point at a
/// section within the current page and so must not be indexed as cross-page
/// links (which would create spurious backlinks), nor map links with no map
/// name (`[[map:]]`).
pub fn extract_links(content: &str) -> (Vec<Link>, Vec<Link>) {
    let (mut pages, mut maps) = (Vec::new(), Vec::new());
    for cap in WIKILINK_RE.captures_iter(content) {
        // Unescaped first, so a table's `\|` leaves no backslash on the name.
        let unescaped = cap[1].replace('\\', "");
        let target = unescaped.trim();
        let (list, target) = if is_map_link_target(target) {
            match map_link_name(target) {
                Some(name) => (&mut maps, name),
                None => continue,
            }
        } else if target.is_empty() {
            continue;
        } else {
            (&mut pages, target)
        };
        list.push(Link {
            target: target.to_string(),
            section: optional_part(&cap, 2).map(str::to_string),
            alias: optional_part(&cap, 3).map(str::to_string),
            // The match for the whole pattern `[[...]]` is at index 0.
            position: Some(offset_to_line_col(content, cap.get(0).unwrap().start())),
        });
    }
    (pages, maps)
}

#[cfg(test)]
mod tests {
    use super::*; // Import everything from the parent module

    fn extract_wikilinks(content: &str) -> Vec<Link> {
        extract_links(content).0
    }

    fn extract_map_links(content: &str) -> Vec<Link> {
        extract_links(content).1
    }

    #[test]
    fn test_same_page_section_link_is_not_indexed() {
        // A target-less section link like [[#Header]] references a heading in the
        // *current* page, not another page, so it must not be extracted as a
        // cross-page link (which would create a spurious backlink).
        let content = "See [[#Overview]] and a real link to [[Other Page]].";
        let links = extract_wikilinks(content);

        assert_eq!(links.len(), 1);
        assert_eq!(links[0].target, "Other Page");
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
- A link with extra whitespace: [[  Whitespace Test | Alias  ]]
- A link with a whitespacey section: [[Test#  My Section  ]]
"#;
        let links = extract_wikilinks(content);

        assert_eq!(links.len(), 7);

        // --- Standard Link ---
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

        // --- Aliased Link ---
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

        // --- Section Link ---
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

        // --- Full Link ---
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

        // --- Inline Link ---
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

        // --- Whitespace Test ---
        assert_eq!(
            links[5],
            Link {
                target: "Whitespace Test".to_string(),
                section: None,
                alias: Some("Alias".to_string()),
                position: Some(LinkPosition {
                    line: 8,
                    column: 33
                })
            }
        );

        // --- Whitespacey Section Test ---
        assert_eq!(
            links[6],
            Link {
                target: "Test".to_string(),
                section: Some("My Section".to_string()),
                alias: None,
                position: Some(LinkPosition {
                    line: 9,
                    column: 38
                })
            }
        );
    }

    #[test]
    fn test_map_link_helpers() {
        assert_eq!(map_link_name("map:Eldoria"), Some("Eldoria"));
        assert_eq!(map_link_name(" Map: Eldoria "), Some("Eldoria"));
        assert_eq!(map_link_name("map:"), None);
        assert_eq!(map_link_name("Eldoria"), None);
        assert!(is_map_link_target("MAP:x"));
        assert!(!is_map_link_target("Mapping"));
    }

    #[test]
    fn test_extract_map_links_variants() {
        let content = "[[map:Eldoria]] [[map:Eldoria#Castle Black|the keep]] \
                       [[ Map: eldoria # castle black ]] [[map:]]";
        let links = extract_map_links(content);

        assert_eq!(links.len(), 3);
        assert_eq!(links[0].target, "Eldoria");
        assert_eq!(links[0].section, None);
        assert_eq!(links[1].target, "Eldoria");
        assert_eq!(links[1].section.as_deref(), Some("Castle Black"));
        assert_eq!(links[1].alias.as_deref(), Some("the keep"));
        assert_eq!(links[2].target, "eldoria");
        assert_eq!(links[2].section.as_deref(), Some("castle black"));
        assert_eq!(
            links[1].position,
            Some(LinkPosition {
                line: 1,
                column: 17
            })
        );
    }

    #[test]
    fn test_map_link_with_escaped_pipe_in_a_table() {
        // In a table the alias pipe is written `\|` (see HELP.md); the
        // backslash must not end up in the map name.
        let links = extract_map_links("| [[map:Eldoria\\|the realm]] |");
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].target, "Eldoria");
        assert_eq!(links[0].alias.as_deref(), Some("the realm"));
    }

    #[test]
    fn test_page_links_skip_map_links() {
        let links = extract_wikilinks("[[Eldoria]] and [[map:Eldoria]] and [[map:]]");
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].target, "Eldoria");
    }
}
