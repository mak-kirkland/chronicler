//! HTML sanitizer.
//!
//! This module is responsible for cleaning rendered HTML to prevent Cross-Site Scripting (XSS) attacks.
//! It uses a strict allow-list of approved tags and attributes, ensuring only safe content is displayed.

use ammonia::Builder;
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
            "div",
            "button",
            "small",
            "meter",
        ]))
        .add_tag_attributes(
            "img",
            &["src", "data", "alt", "style", "width", "height", "class"],
        )
        .add_tag_attributes("figure", &["style"])
        .add_tag_attributes("figcaption", &["style"])
        .add_tag_attributes("a", &["href", "title", "class", "data-path", "data-target"])
        .add_tag_attributes("span", &["class", "style"])
        .add_tag_attributes("p", &["style", "id"])
        .add_tag_attributes("details", &["open"])
        .add_tag_attributes("abbr", &["title"]) // Allow title for abbreviations
        .add_tag_attributes("div", &["style", "class", "id"])
        .add_tag_attributes("th", &["style", "align", "valign", "width"]) // Allow table header alignment
        .add_tag_attributes("td", &["style", "align", "valign", "width"]) // Allow table cell alignment
        // Allow 'id' attribute on all heading tags for TOC linking.
        .add_tag_attributes("h1", &["id"])
        .add_tag_attributes("h2", &["id"])
        .add_tag_attributes("h3", &["id"])
        .add_tag_attributes("h4", &["id"])
        .add_tag_attributes("h5", &["id"])
        .add_tag_attributes("h6", &["id"])
        .add_tag_attributes(
            "table",
            &[
                "border",
                "align",
                "width",
                "cellspacing",
                "cellpadding",
                "style",
                "class",
            ],
        )
        .add_tag_attributes("button", &["class"])
        .add_tag_attributes("meter", &["value", "min", "max"])
        .clean(dirty_html)
        .to_string()
}
