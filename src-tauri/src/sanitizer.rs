//! HTML sanitizer.
//!
//! This module is responsible for cleaning rendered HTML to prevent Cross-Site Scripting (XSS) attacks.
//! It uses a strict allow-list of approved tags and attributes, ensuring only safe content is displayed.

use ammonia::Builder;
use serde_json::Value;
use std::collections::HashSet;

/// Cleans user-provided HTML, removing potentially dangerous tags and attributes
/// to prevent XSS attacks.
pub fn sanitize_html(dirty_html: &str) -> String {
    Builder::new()
        .link_rel(None) // Do not add rel="noopener noreferrer" to links.
        .tags(HashSet::from([
            "figure",
            "img",
            "figcaption",
            "strong",
            "b",
            "em",
            "i",
            "p",
            "br",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "pre",
            "code",
            "blockquote",
            "ul",
            "ol",
            "li",
            "a",
            "table",
            "thead",
            "tbody",
            "tr",
            "th",
            "td",
            "span",
            "hr",      // Horizontal Rule
            "del",     // Strikethrough
            "s",       // Strikethrough (alternative)
            "sub",     // Subscript
            "sup",     // Superscript
            "dl",      // Definition List
            "dt",      // Definition Term
            "dd",      // Definition Description
            "details", // Collapsible details element
            "summary", // Summary for the details element
            "kbd",     // Keyboard input
            "abbr",    // Abbreviation
        ]))
        .add_tag_attributes("img", &["src", "data", "alt", "style", "width", "height"])
        .add_tag_attributes("figure", &["style"])
        .add_tag_attributes("figcaption", &["style"])
        .add_tag_attributes("a", &["href", "title", "class", "data-path", "data-target"])
        .add_tag_attributes("span", &["class"])
        .add_tag_attributes("details", &["open"])
        .add_tag_attributes("abbr", &["title"]) // Allow title for abbreviations
        .add_tag_attributes("th", &["style", "align", "valign"]) // Allow table header alignment
        .add_tag_attributes("td", &["style", "align", "valign"]) // Allow table cell alignment
        // Allow 'id' attribute on all heading tags for TOC linking.
        .add_tag_attributes("h1", &["id"])
        .add_tag_attributes("h2", &["id"])
        .add_tag_attributes("h3", &["id"])
        .add_tag_attributes("h4", &["id"])
        .add_tag_attributes("h5", &["id"])
        .add_tag_attributes("h6", &["id"])
        .add_tag_attributes("table", &["border", "align"]) // Allow border and align on tables
        .clean(dirty_html)
        .to_string()
}

/// Recursively sanitizes all string values within a `serde_json::Value`.
/// This is crucial for cleaning frontmatter data before it is sent to the frontend.
pub fn sanitize_json_values(value: &mut Value) {
    match value {
        Value::String(s) => {
            // Sanitize the string in place.
            *s = sanitize_html(&s);
        }
        Value::Array(a) => {
            // Recursively sanitize each element in the array.
            for item in a.iter_mut() {
                sanitize_json_values(item);
            }
        }
        Value::Object(m) => {
            // Recursively sanitize each value in the map.
            for (_, v) in m.iter_mut() {
                sanitize_json_values(v);
            }
        }
        // Other types like Number, Bool, Null are skipped.
        _ => {}
    }
}
