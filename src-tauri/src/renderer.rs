//! Markdown and Wikilink rendering engine.

use crate::error::ChroniclerError;
use crate::models::{Backlink, FullPageData};
use crate::wikilink::WIKILINK_RE;
use crate::{error::Result, indexer::Indexer, models::RenderedPage, parser};
use base64::{engine::general_purpose, Engine as _};
use parking_lot::RwLock;
use pulldown_cmark::{html, Event, Options, Parser};
use regex::Captures;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// A struct responsible for rendering Markdown content.
#[derive(Debug)]
pub struct Renderer {
    indexer: Arc<RwLock<Indexer>>,
    // The vault path is needed to resolve relative image paths.
    vault_path: PathBuf,
}

/// Determines the MIME type of a file based on its extension.
fn get_mime_type(filename: &str) -> &str {
    let lower = filename.to_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else {
        "application/octet-stream"
    }
}

impl Renderer {
    /// Creates a new Renderer.
    pub fn new(indexer: Arc<RwLock<Indexer>>, vault_path: PathBuf) -> Self {
        Self {
            indexer,
            vault_path,
        }
    }

    /// Processes an image source path, returning a Base64 Data URL.
    /// It resolves both absolute and relative paths before encoding.
    pub fn convert_image_path_to_data_url(&self, path_str: &str) -> String {
        let path = Path::new(path_str);
        let absolute_path = if path.is_absolute() {
            path.to_path_buf()
        } else {
            // Assumes relative paths are inside the vault's "images" directory.
            self.vault_path.join("images").join(path)
        };

        if let Ok(data) = fs::read(&absolute_path) {
            let mime_type = get_mime_type(path_str);
            let encoded = general_purpose::STANDARD.encode(data);
            format!("data:{};base64,{}", mime_type, encoded)
        } else {
            // If reading the file fails, return the original src to show a broken image link.
            path_str.to_string()
        }
    }

    /// Processes raw markdown content into a structured, rendered page object.
    pub fn render_page_preview(&self, content: &str) -> Result<RenderedPage> {
        // 1. Separate frontmatter from the body
        let (frontmatter_str, body) = parser::extract_frontmatter(content);

        // Instead of returning a hard error with `?`, we match on the result.
        // If parsing fails, we create a special JSON object with error details.
        let mut frontmatter_json = match parser::parse_frontmatter(frontmatter_str, Path::new("")) {
            Ok(fm) => fm,
            Err(e) => {
                // The frontend's Infobox component knows how to display this error object.
                let mut error_map = serde_json::Map::new();
                error_map.insert(
                    "error".to_string(),
                    Value::String("YAML Parse Error".to_string()),
                );
                error_map.insert("details".to_string(), Value::String(e.to_string()));
                Value::Object(error_map)
            }
        };

        // 2. Process special fields within the frontmatter JSON
        if let Value::Object(map) = &mut frontmatter_json {
            // Process wikilinks in all string and array-of-string values
            for (_, value) in map.iter_mut() {
                if let Value::String(s) = value {
                    *value = Value::String(self.render_wikilinks_in_string(s));
                } else if let Value::Array(arr) = value {
                    for item in arr.iter_mut() {
                        if let Value::String(s) = item {
                            *item = Value::String(self.render_wikilinks_in_string(s));
                        }
                    }
                }
            }

            // Specifically process the 'image' field for the infobox.
            if let Some(Value::String(image_path)) = map.get("image").cloned() {
                let processed_src = self.convert_image_path_to_data_url(&image_path);
                map.insert("image".to_string(), Value::String(processed_src));
            }
        }

        // 3. Render the main body content to HTML, correctly handling wikilinks.
        let rendered_html = self.render_body_to_html(body);

        // 4. Return the complete structure.
        Ok(RenderedPage {
            processed_frontmatter: frontmatter_json,
            rendered_html,
        })
    }

    /// Replaces all wikilink syntax in a string with valid HTML <a> tags.
    fn render_wikilinks_in_string(&self, text: &str) -> String {
        let indexer = self.indexer.read();

        WIKILINK_RE
            .replace_all(text, |caps: &Captures| {
                let target = caps.get(1).map_or("", |m| m.as_str()).trim();
                let alias = caps.get(3).map(|m| m.as_str().trim()).unwrap_or(target);
                let normalized_target = target.to_lowercase();

                if let Some(path) = indexer.link_resolver.get(&normalized_target) {
                    format!(
                        "<a href=\"#\" class=\"internal-link\" data-path=\"{}\">{}</a>",
                        path.to_string_lossy(),
                        alias
                    )
                } else {
                    format!("<span class=\"internal-link broken\">{}</span>", alias)
                }
            })
            .to_string()
    }

    /// Renders Markdown body content to HTML, processing custom wikilinks.
    ///
    /// ## Behavior
    ///
    /// This function implements a specific set of rules for rendering `[[wikilinks]]`:
    ///
    /// 1.  **Block-Level Code**: Wikilinks ARE processed inside fenced (```) and indented code blocks.
    /// 2.  **Inline Code**: Wikilinks are NOT processed inside inline (` `) code and the literal `[[...]]` syntax is preserved.
    /// 3.  **All Other Text**: Wikilinks are processed as normal.
    ///
    /// ## Implementation Details
    ///
    /// The `pulldown-cmark` parser emits a stream of events. A key challenge is that it may
    /// fragment text, for example, sending `[[wikilink]]` as three separate `Text` events:
    /// `Text("[[")`, `Text("wikilink")`, and `Text("]]")`.
    ///
    /// To solve this, we use a **text-buffering** (or coalescing) strategy:
    /// - We loop through the events from the parser.
    /// - `Text` events are collected into a temporary `text_buffer`.
    /// - Any non-`Text` event triggers a "flush" of the buffer. Flushing involves running the
    ///   wikilink replacement logic on the entire buffered string.
    ///
    /// This approach works because of how `pulldown-cmark` creates events:
    /// - The content of **block-level code** is made of `Text` events, so it gets buffered and processed.
    /// - **Inline code** is a single, discrete `Event::Code`, not `Text`. This event triggers a buffer
    ///   flush and is then passed through, so its content is never processed for wikilinks.
    ///
    fn render_body_to_html(&self, markdown: &str) -> String {
        // --- 1. Initial Setup ---

        // Standard pulldown-cmark options to enable features like tables and strikethrough.
        let mut options = Options::empty();
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_FOOTNOTES);

        // Create the event stream parser from the raw Markdown string.
        let parser = Parser::new_ext(markdown, options);

        // This closure is a helper for building the final HTML for a found wikilink.
        // It's defined once here to be reused later. It checks if the link exists
        // and creates either a valid <a> tag or a "broken link" <span> tag.
        let indexer = self.indexer.read();
        let build_link_html = |caps: &Captures| -> String {
            let target = caps.get(1).map_or("", |m| m.as_str()).trim();
            let alias = caps.get(3).map(|m| m.as_str().trim()).unwrap_or(target);
            let normalized_target = target.to_lowercase();

            if let Some(path) = indexer.link_resolver.get(&normalized_target) {
                format!(
                    "<a href=\"#\" class=\"internal-link\" data-path=\"{}\">{}</a>",
                    path.to_string_lossy(),
                    alias
                )
            } else {
                format!("<span class=\"internal-link broken\">{}</span>", alias)
            }
        };

        // `new_events` will store our final, modified list of events after processing.
        let mut new_events = Vec::new();
        // `text_buffer` will temporarily store the content of consecutive `Text` events.
        let mut text_buffer = String::new();

        // --- 2. The Flushing Closure ---

        // This closure contains the logic to process the contents of `text_buffer`.
        // It's called whenever we need to "flush" the text we've gathered.
        let flush_text_buffer = |buffer: &mut String, events: &mut Vec<Event>| {
            // If the buffer is empty, there's nothing to do.
            if buffer.is_empty() {
                return;
            }

            // Find all wikilink matches in the entire buffered string.
            let matches: Vec<_> = WIKILINK_RE.find_iter(buffer).collect();

            // If there are no wikilinks, just push the whole buffer as a single `Text` event.
            if matches.is_empty() {
                events.push(Event::Text(buffer.clone().into()));
            } else {
                // If we found wikilinks, we need to reconstruct the text around them.
                let mut last_end = 0;
                for mat in matches {
                    // 1. Push the plain text *before* the wikilink.
                    if mat.start() > last_end {
                        events.push(Event::Text(
                            buffer[last_end..mat.start()].to_string().into(),
                        ));
                    }
                    // 2. Build the HTML for the wikilink itself and push it as an `Html` event.
                    if let Some(caps) = WIKILINK_RE.captures(mat.as_str()) {
                        let html_link = build_link_html(&caps);
                        events.push(Event::Html(html_link.into()));
                    }
                    // 3. Update our position to the end of the current wikilink match.
                    last_end = mat.end();
                }
                // 4. After the loop, push any remaining plain text *after* the last wikilink.
                if last_end < buffer.len() {
                    events.push(Event::Text(buffer[last_end..].to_string().into()));
                }
            }
            // Reset the buffer so it's ready for the next block of text.
            buffer.clear();
        };

        // --- 3. The Main Event Loop ---

        for event in parser {
            match event {
                // If the event is text, add it to our buffer. Don't process it yet.
                Event::Text(text) => {
                    text_buffer.push_str(&text);
                }
                // If the event is *anything else* (a start tag, end tag, code event, etc.),
                // it signals the end of our consecutive text block.
                _ => {
                    // So, first, we flush the text buffer we've built up.
                    flush_text_buffer(&mut text_buffer, &mut new_events);
                    // Then, we push the non-text event that triggered the flush.
                    new_events.push(event);
                }
            }
        }
        // It's possible for the markdown to end with text, leaving content in the buffer.
        // This final flush ensures that last bit of text gets processed.
        flush_text_buffer(&mut text_buffer, &mut new_events);

        // --- 4. Final HTML Rendering ---

        // Render our new, modified stream of events into the final HTML string.
        let mut html_output = String::new();
        html::push_html(&mut html_output, new_events.into_iter());
        html_output
    }

    /// Renders a full Markdown string to an HTML string using pulldown-cmark.
    /// This function handles only standard Markdown syntax and does not process
    /// any custom syntax like wikilinks.
    fn render_markdown_to_html(&self, markdown: &str) -> String {
        let mut options = Options::empty();
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_FOOTNOTES);

        let parser = Parser::new_ext(markdown, options);
        let mut html_output = String::new();
        html::push_html(&mut html_output, parser);

        html_output
    }

    /// Renders a string of pure Markdown to a `RenderedPage` object containing only HTML.
    /// This command is used for rendering content that should not have wikilinks processed,
    /// such as the help file.
    pub fn render_markdown(&self, markdown: &str) -> Result<RenderedPage> {
        let rendered_html = self.render_markdown_to_html(markdown);
        Ok(RenderedPage {
            processed_frontmatter: serde_json::Value::Null,
            rendered_html,
        })
    }

    /// Fetches all data for a given page path and returns a `FullPageData`
    /// object suitable for displaying in the main file view. This includes
    /// raw content, rendered content, and backlink information.
    pub fn build_page_view(&self, path: &str) -> Result<FullPageData> {
        let raw_content = fs::read_to_string(path)?;
        let rendered_page = self.render_page_preview(&raw_content)?;

        let indexer = self.indexer.read();
        let page_path = Path::new(path);

        let page = indexer
            .pages
            .get(page_path)
            .ok_or(ChroniclerError::FileNotFound(page_path.to_path_buf()))?;

        let mut backlinks: Vec<Backlink> = page
            .backlinks
            .iter()
            .filter_map(|backlink_path| {
                indexer.pages.get(backlink_path).map(|p| {
                    // Get the count of links from the source (backlink_path) to the target (page_path)
                    let count = indexer
                        .link_graph
                        .get(backlink_path)
                        .and_then(|targets| targets.get(page_path))
                        .map_or(0, |links| links.len());

                    Backlink {
                        title: p.title.clone(),
                        path: p.path.clone(),
                        count,
                    }
                })
            })
            .collect();

        // Sort backlinks alphabetically by title (case-insensitive)
        backlinks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));

        Ok(FullPageData {
            raw_content,
            rendered_page,
            backlinks,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::indexer::Indexer;
    use parking_lot::RwLock;
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::Arc;
    use tempfile::tempdir;

    /// Helper function to set up a renderer with a pre-populated index.
    fn setup_renderer() -> (Renderer, PathBuf) {
        let dir = tempdir().unwrap();
        let root = dir.path();

        // Create a dummy file for link resolution
        let page1_path = root.join("Page One.md");
        fs::write(&page1_path, "content").unwrap();

        // Create and scan the indexer
        let mut indexer = Indexer::new(root);
        indexer.full_scan(root).unwrap();

        let indexer_arc = Arc::new(RwLock::new(indexer));
        let renderer = Renderer::new(indexer_arc, root.to_path_buf());

        (renderer, page1_path)
    }

    #[test]
    fn test_render_wikilinks_in_string() {
        let (renderer, page1_path) = setup_renderer();
        let content = "Link to [[Page One]] and a [[Broken Link|bad link]].";
        let rendered = renderer.render_wikilinks_in_string(content);

        let expected_path_str = page1_path.to_string_lossy();
        let expected = format!(
            "Link to <a href=\"#\" class=\"internal-link\" data-path=\"{}\">Page One</a> and a <span class=\"internal-link broken\">bad link</span>.",
            expected_path_str
        );

        assert_eq!(rendered, expected);
    }

    #[test]
    fn test_render_page_preview_with_valid_frontmatter() {
        let (renderer, page1_path) = setup_renderer();
        let content = "---\ntitle: Test\nrelation: 'A link to [[Page One]]'\n---\nBody content with [[Page One|an alias]].".to_string();

        let result = renderer.render_page_preview(&content).unwrap();
        let expected_path_str = page1_path.to_string_lossy();

        // Check frontmatter
        assert_eq!(result.processed_frontmatter["title"], "Test");
        let expected_relation_html = format!(
            "A link to <a href=\"#\" class=\"internal-link\" data-path=\"{}\">Page One</a>",
            expected_path_str
        );
        assert_eq!(
            result.processed_frontmatter["relation"],
            expected_relation_html
        );

        // Check body
        let expected_body_html = format!(
            "<p>Body content with <a href=\"#\" class=\"internal-link\" data-path=\"{}\">an alias</a>.</p>\n",
            expected_path_str
        );
        assert_eq!(result.rendered_html, expected_body_html);
    }

    #[test]
    fn test_render_page_preview_with_malformed_yaml() {
        let (renderer, _) = setup_renderer();
        let content = "---\ntitle: Test\ninvalid yaml: here:\n---\nBody.";
        let result = renderer.render_page_preview(content).unwrap();

        // Check that the frontmatter contains the error object
        assert_eq!(
            result.processed_frontmatter["error"],
            json!("YAML Parse Error")
        );
        assert!(result.processed_frontmatter["details"].is_string());

        // Check that the body is still rendered
        assert_eq!(result.rendered_html, "<p>Body.</p>\n");
    }

    #[test]
    fn test_render_page_preview_no_frontmatter() {
        let (renderer, _) = setup_renderer();
        let content = "# Title\nJust body content, with a [[Broken Link]].";
        let result = renderer.render_page_preview(content).unwrap();

        // Frontmatter should be null
        assert!(result.processed_frontmatter.is_null());

        // Body should be rendered with the broken link
        let expected_html = "<h1>Title</h1>\n<p>Just body content, with a <span class=\"internal-link broken\">Broken Link</span>.</p>\n";
        assert_eq!(result.rendered_html, expected_html);
    }

    #[test]
    fn test_render_markdown_does_not_process_wikilinks() {
        let (renderer, _) = setup_renderer();
        let content = "# Help File\nThis is how you write a wikilink: `[[Page Name]]`.";
        let result = renderer.render_markdown(content).unwrap();

        // Frontmatter should be null
        assert!(result.processed_frontmatter.is_null());

        // The wikilink syntax should be preserved inside the code block
        let expected_html = "<h1>Help File</h1>\n<p>This is how you write a wikilink: <code>[[Page Name]]</code>.</p>\n";
        assert_eq!(result.rendered_html, expected_html);
    }

    #[test]
    fn test_wikilinks_in_code_blocks_are_processed() {
        let (renderer, page1_path) = setup_renderer();

        // This content covers all three code block scenarios.
        // A blank line is now correctly placed before the indented code block.
        let content = r#"
Case 1: Indented with 4 spaces

    [[Page One]]

Case 2: Fenced with backticks

```
[[Page One]]
```

Case 3: Inline with single backticks `[[Page One]]`.

A normal link for comparison: [[Page One]].
"#;

        let result = renderer.render_page_preview(content).unwrap();
        let expected_path_str = page1_path.to_string_lossy();

        // The expected HTML now asserts that wikilinks ARE rendered inside
        // indented and fenced code blocks, but NOT inside inline code.
        let expected_html = format!(
            "<p>Case 1: Indented with 4 spaces</p>\n<pre><code><a href=\"#\" class=\"internal-link\" data-path=\"{0}\">Page One</a>\n</code></pre>\n<p>Case 2: Fenced with backticks</p>\n<pre><code><a href=\"#\" class=\"internal-link\" data-path=\"{0}\">Page One</a>\n</code></pre>\n<p>Case 3: Inline with single backticks <code>[[Page One]]</code>.</p>\n<p>A normal link for comparison: <a href=\"#\" class=\"internal-link\" data-path=\"{0}\">Page One</a>.</p>\n",
            expected_path_str
        );

        assert_eq!(result.rendered_html, expected_html);
    }
}
