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
        // 1. GLOBAL ALLOW LIST: These schemes are "technically valid"
        .url_schemes(HashSet::from([
            "http", "https", "mailto", "data",  // Allow 'data' for external images
            "asset", // Allow 'asset' for local images
        ]))
        // 2. CONTEXTUAL WHITELIST: Enforce WHERE they can be used
        .attribute_filter(|element, attribute, value| {
            // Check if the value is trying to use the data protocol
            if value.to_lowercase().starts_with("data:") {
                // WHITELIST: Only allow 'data:' on <img src="...">
                if element == "img" && attribute == "src" {
                    return Some(value.into());
                }
                // BLOCK: Reject 'data:' for <a>, <video>, or any other tag/attribute
                return None;
            }

            // WHITELIST: Only allow safe <input> types (checkbox and radio)
            // This prevents phishing vectors like type="text" or type="password"
            if element == "input" && attribute == "type" {
                let lower = value.to_lowercase();
                if lower == "checkbox" || lower == "radio" {
                    return Some(value.into());
                }
                return None;
            }

            // Allow other protocols (http, asset, etc.) to pass through
            Some(value.into())
        })
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
            "tfoot",
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
            "progress", // Progress bar (quest trackers, completion indicators)
            // --- Interactive Elements (CSS-only tabs, checklists) ---
            "input",    // Restricted to type="checkbox" and type="radio" via attribute_filter
            "label",    // Clickable labels for inputs
            "fieldset", // Visual grouping for radio/checkbox sets
            "legend",   // Caption for fieldset
            "select",   // Dropdown menus
            "optgroup", // Option group for dropdowns
            "option",   // Dropdown options
            // --- Inline Semantic Tags ---
            "mark", // Highlighted text (lore annotations)
            "ins",  // Inserted text (complement to <del>)
            "dfn",  // Definition of a term (in-world terminology)
            "cite", // Citation (in-world references)
            "time", // Temporal data (worldbuilding timelines)
            // --- Ruby Annotations (constructed languages, pronunciation) ---
            "ruby", // Ruby annotation container
            "rt",   // Ruby text (pronunciation/translation)
            "rp",   // Ruby fallback parentheses
            // --- Table Enhancements ---
            "caption",  // Table caption
            "colgroup", // Column grouping
            "col",      // Column styling
            // --- Math Support (MathML tags) ---
            "math",
            "mi",
            "mn",
            "mo",
            "ms",
            "mtext",
            "mrow",
            "semantics",
            "annotation",
        ]))
        .add_tag_attributes("img", &["src", "alt", "style", "width", "height", "class"])
        .add_tag_attributes("figure", &["style"])
        .add_tag_attributes("figcaption", &["style"])
        .add_tag_attributes("a", &["href", "title", "class", "data-path", "data-target"])
        .add_tag_attributes("span", &["class", "style"])
        .add_tag_attributes("br", &["style", "class", "id"])
        .add_tag_attributes("p", &["style", "id"])
        .add_tag_attributes("details", &["open", "name"])
        .add_tag_attributes("abbr", &["title"]) // Allow title for abbreviations
        .add_tag_attributes("div", &["style", "class", "id"])
        .add_tag_attributes("th", &["style", "align", "valign", "width", "bgcolor"]) // Allow table header alignment
        .add_tag_attributes("td", &["style", "align", "valign", "width", "bgcolor"]) // Allow table cell alignment
        .add_tag_attributes(
            "tr",
            &["style", "align", "valign", "bgcolor", "class", "id"],
        )
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
                "bgcolor",
            ],
        )
        .add_tag_attributes("button", &["class"])
        .add_tag_attributes("meter", &["value", "min", "max"])
        .add_tag_attributes("progress", &["value", "max"])
        // --- Interactive Element Attributes ---
        .add_tag_attributes("input", &["type", "name", "id", "checked", "disabled"])
        .add_tag_attributes("label", &["for", "class", "style"])
        .add_tag_attributes("fieldset", &["class", "style"])
        .add_tag_attributes("legend", &["class", "style"])
        .add_tag_attributes(
            "select",
            &[
                "name", "id", "disabled", "multiple", "required", "class", "style",
            ],
        )
        .add_tag_attributes("optgroup", &["label", "disabled"])
        .add_tag_attributes("option", &["value", "selected", "disabled", "label"])
        // --- Inline Semantic Attributes ---
        .add_tag_attributes("mark", &["class", "style"])
        .add_tag_attributes("time", &["datetime"])
        .add_tag_attributes("col", &["span", "style"])
        .add_tag_attributes("colgroup", &["span"])
        // --- Math Support Attributes ---
        .add_tag_attributes("math", &["xmlns", "display"])
        .add_tag_attributes("annotation", &["encoding"])
        .clean(dirty_html)
        .to_string()
}
