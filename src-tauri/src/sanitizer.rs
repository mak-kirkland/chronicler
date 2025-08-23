// src/sanitizer.rs

use ammonia::Builder;
use std::collections::HashSet;

/// Cleans user-provided HTML, removing potentially dangerous tags and attributes
/// to prevent XSS attacks.
pub fn sanitize_html(dirty_html: &str) -> String {
    Builder::new()
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
            "kbd",  // Keyboard input
            "abbr", // Abbreviation
        ]))
        .add_tag_attributes("img", &["src", "data", "alt", "style", "width", "height"])
        .add_tag_attributes("figure", &["style"])
        .add_tag_attributes("figcaption", &["style"])
        .add_tag_attributes("a", &["href", "title", "class", "data-path"])
        .add_tag_attributes("span", &["class"])
        .add_tag_attributes("details", &["open"])
        .add_tag_attributes("abbr", &["title"]) // Allow title for abbreviations
        .add_tag_attributes("th", &["style", "align"]) // Allow table header alignment
        .add_tag_attributes("td", &["style", "align"]) // Allow table cell alignment
        .clean(dirty_html)
        .to_string()
}
