//! Markdown and Wikilink rendering engine.

use crate::config::IMAGES_DIR_NAME;
use crate::error::ChroniclerError;
use crate::models::{Backlink, FullPageData, TocEntry};
use crate::sanitizer;
use crate::wikilink::WIKILINK_RE;
use crate::{error::Result, indexer::Indexer, models::RenderedPage, parser};
use base64::{engine::general_purpose, Engine as _};
use html_escape::decode_html_entities;
use parking_lot::RwLock;
use percent_encoding::percent_decode_str;
use pulldown_cmark::{html, CowStr, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use regex::{Captures, Regex};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock};

/// Spoiler regex pattern.
/// Captures: 1: content
/// Format: ||content||
static SPOILER_RE: LazyLock<Regex> = LazyLock::new(|| {
    // The `.*?` is a non-greedy match to correctly handle multiple spoilers on one line.
    Regex::new(r"\|\|(.*?)\|\|").unwrap()
});

/// HTML img tag regex pattern.
/// Captures: 1: src attribute content
/// Used to find and replace local image paths with Base64 data URLs.
static IMG_TAG_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"<img src="([^"]+)""#).unwrap());

/// Wikilink Image regex pattern.
/// Captures: 1: target/filename, 2: alias/alt-text
/// Format: ![[filename.png|alt text]]
static WIKILINK_IMAGE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"!\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]"#).unwrap());

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

    /// Resolves a potentially relative image path to an absolute path within the vault.
    ///
    /// This helper centralizes the logic for handling image paths. It correctly
    /// handles both absolute paths and relative paths, which are assumed to be
    /// inside the vault's "images" subdirectory.
    fn resolve_image_path(&self, path_str: &str) -> PathBuf {
        let path = Path::new(path_str);
        if path.is_absolute() {
            path.to_path_buf()
        } else {
            // Assumes relative paths are inside the vault's "images" directory.
            self.vault_path.join(IMAGES_DIR_NAME).join(path)
        }
    }

    /// Processes the `image` field from the frontmatter.
    ///
    /// This function handles all logic for the infobox image:
    /// 1. Resolves the absolute path of the image.
    /// 2. Adds the absolute path to the JSON map under the `image_path` key for the frontend.
    /// 3. Converts the image to a Base64 Data URL and updates the `image` key.
    fn process_infobox_image(&self, map: &mut Map<String, Value>, relative_image_path: &str) {
        let absolute_path = self.resolve_image_path(relative_image_path);

        // If the image exists, add its absolute path to the payload for the frontend.
        // This allows the frontend to open the image in the viewer without knowing
        // the vault's file structure.
        if absolute_path.exists() {
            map.insert(
                "image_path".to_string(),
                Value::String(absolute_path.to_string_lossy().to_string()),
            );
        }

        // Convert the original path to a Base64 Data URL for embedding in the infobox preview.
        let processed_src = self.convert_image_path_to_data_url(relative_image_path);
        map.insert("image".to_string(), Value::String(processed_src));
    }

    /// Processes an image source path, returning a Base64 Data URL.
    /// It resolves both absolute and relative paths before encoding.
    pub fn convert_image_path_to_data_url(&self, path_str: &str) -> String {
        let absolute_path = self.resolve_image_path(path_str);

        if let Ok(data) = fs::read(&absolute_path) {
            let mime_type = get_mime_type(path_str);
            let encoded = general_purpose::STANDARD.encode(data);
            format!("data:{};base64,{}", mime_type, encoded)
        } else {
            // If reading the file fails, return the original src to show a broken image link.
            path_str.to_string()
        }
    }

    /// A post-processing step that finds all standard HTML `<img src="...">` tags
    /// in a block of rendered HTML and converts their `src` paths to Base64 data URLs.
    /// This allows users to embed images directly in the markdown body with standard HTML.
    fn process_body_image_tags(&self, html: &str) -> String {
        IMG_TAG_RE
            .replace_all(html, |caps: &Captures| {
                // 1. Get the path, which might have both HTML and URL encoding
                let encoded_path_str = &caps[1];

                // 2. First, decode HTML entities (e.g., &amp; -> &)
                let html_decoded_path = decode_html_entities(encoded_path_str);

                // 3. Then, decode URL percent-encoding (e.g., %20 -> ' ')
                let final_path = percent_decode_str(&html_decoded_path)
                    .decode_utf8_lossy()
                    .to_string();

                // 4. Use the fully decoded path to find and convert the image
                let data_url = self.convert_image_path_to_data_url(&final_path);

                // Reconstruct the img tag with the new data URL
                format!("<img src=\"{}\"", data_url)
            })
            .to_string()
    }

    /// Processes a single string value from the frontmatter, rendering any custom syntax
    /// (wikilinks, spoilers, image tags) into final HTML.
    fn render_frontmatter_string_as_html(&self, text: &str) -> String {
        // 1. Process wikilinks, spoilers, and ![[image]] syntax.
        let with_custom_syntax = self.render_custom_syntax_in_string(text);
        // 2. Process any standard <img src="..."> tags that resulted from step 1 or were there originally.
        self.process_body_image_tags(&with_custom_syntax)
    }

    /// Takes a parsed serde_json::Value representing the frontmatter, sanitizes it,
    /// and recursively processes all string fields to render custom syntax. This
    /// function modifies the `Value` in place.
    fn process_frontmatter(&self, frontmatter: &mut Value) {
        sanitizer::sanitize_json_values(frontmatter);

        if let Value::Object(map) = frontmatter {
            // Process custom syntax in all string and array-of-string values
            for (_, value) in map.iter_mut() {
                if let Value::String(s) = value {
                    *value = Value::String(self.render_frontmatter_string_as_html(s));
                } else if let Value::Array(arr) = value {
                    for item in arr.iter_mut() {
                        if let Value::String(s) = item {
                            *item = Value::String(self.render_frontmatter_string_as_html(s));
                        }
                    }
                }
            }

            // Specifically process the 'image' field for the infobox.
            if let Some(Value::String(relative_image_path)) = map.get("image").cloned() {
                self.process_infobox_image(map, &relative_image_path);
            }
        }
    }

    /// Processes raw markdown content into a structured, rendered page object.
    pub fn render_page_preview(&self, content: &str) -> Result<RenderedPage> {
        // 1. Separate and parse the frontmatter.
        let (frontmatter_str, body) = parser::extract_frontmatter(content);
        let mut frontmatter_json = match parser::parse_frontmatter(frontmatter_str, Path::new("")) {
            Ok(fm) => fm,
            Err(e) => {
                // If parsing fails, create a special JSON object with error details.
                let mut error_map = serde_json::Map::new();
                error_map.insert(
                    "error".to_string(),
                    Value::String("YAML Parse Error".to_string()),
                );
                error_map.insert("details".to_string(), Value::String(e.to_string()));
                Value::Object(error_map)
            }
        };

        // 2. Sanitize and render all fields within the frontmatter.
        self.process_frontmatter(&mut frontmatter_json);

        // 3. Render the main body content to HTML, correctly handling custom syntax.
        let (html_before_toc, html_after_toc, toc) = self.render_body_to_html_with_toc(body);

        // 4. Return the complete structure.
        Ok(RenderedPage {
            processed_frontmatter: frontmatter_json,
            html_before_toc,
            html_after_toc,
            toc,
        })
    }

    /// Replaces all custom syntax (spoilers and wikilinks) in a string with valid HTML.
    fn render_custom_syntax_in_string(&self, text: &str) -> String {
        // 1. Process spoilers first.
        let with_spoilers = SPOILER_RE.replace_all(text, |caps: &Captures| {
            format!("<span class=\"spoiler\">{}</span>", &caps[1])
        });

        // 2. Process image wikilinks ![[...]] into <img> tags.
        let with_images = WIKILINK_IMAGE_RE.replace_all(&with_spoilers, |caps: &Captures| {
            let path_str = caps.get(1).map_or("", |m| m.as_str()).trim();
            let alt_text = caps.get(2).map_or(path_str, |m| m.as_str().trim());

            // Generate the simple <img> tag with the given path.
            // This will then be handled by the `process_body_image_tags` post-processor.
            format!(
                r#"<img src="{}" alt="{}" class="embedded-image">"#,
                // Use the normalized path directly as the src
                path_str,
                html_escape::encode_double_quoted_attribute(alt_text)
            )
        });

        // 3. Finally, process standard wikilinks [[...]] on the remaining text.
        let indexer = self.indexer.read();
        WIKILINK_RE
            .replace_all(&with_images, |caps: &Captures| {
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
                    format!(
                        "<a href=\"#\" class=\"internal-link broken\" data-target=\"{}\">{}</a>",
                        target, // Use the original target name for creation
                        alias
                    )
                }
            })
            .to_string()
    }

    /// Extracts the display text from wikilinks within a string, leaving other text intact.
    /// For example, "[[Page|Alias]] (extra)" becomes "Alias (extra)".
    fn extract_display_text_from_wikilinks(&self, text: &str) -> String {
        WIKILINK_RE
            .replace_all(text, |caps: &Captures| {
                // Use the alias (capture group 3) if it exists, otherwise use the target (capture group 1).
                let alias = caps.get(3).map(|m| m.as_str().trim());
                let target = caps.get(1).map(|m| m.as_str().trim()).unwrap_or("");
                alias.unwrap_or(target).to_string()
            })
            .to_string()
    }

    /// Renders Markdown body content to HTML, processing custom wikilinks, and generating a TOC.
    ///
    /// The function splits the resulting HTML at the first header, allowing the frontend
    /// to inject the Table of Contents between any introductory content and the main body.
    ///
    /// ## Behavior
    ///
    /// This function implements a specific set of rules for rendering `[[wikilinks]]`:
    ///
    /// 1.  **Block-Level Code**: Wikilinks ARE processed inside fenced (```) and indented code blocks.
    /// 2.  **Inline Code**: Wikilinks are NOT processed inside inline (` `) code and the literal `[[...]]` syntax is preserved.
    /// 3.  **All Other Text**: Wikilinks are processed as normal.
    ///
    /// ## Table of Contents Generation
    ///
    /// A preliminary pass is made over the Markdown to extract all headers (`<h1>` to `<h6>`).
    /// For each header, it generates:
    /// - A hierarchical number (e.g., "1", "1.1", "2").
    /// - A unique, URL-friendly `id` (a "slug") for anchor linking. Duplicate header
    ///   text is handled by appending a counter to the slug (e.g., `my-header`, `my-header-1`).
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
    /// ## Returns
    ///
    /// A tuple `(html_before_toc, html_after_toc, toc)` where:
    /// - `html_before_toc`: Rendered HTML of all content *before* the first header.
    /// - `html_after_toc`: Rendered HTML of all content *from* the first header onwards.
    /// - `toc`: A `Vec<TocEntry>` representing the structured Table of Contents.
    ///
    fn render_body_to_html_with_toc(&self, markdown: &str) -> (String, String, Vec<TocEntry>) {
        // --- 1. Initial Setup ---

        // Standard pulldown-cmark options to enable features like tables and strikethrough.
        let mut options = Options::empty();
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_FOOTNOTES);

        // Create the event stream parser from the raw Markdown string.
        let parser = Parser::new_ext(markdown, options);
        // We collect events first to allow for a multi-pass approach.
        let events: Vec<Event> = parser.into_iter().collect();

        // --- Pass 1: Extract Headers and Generate TOC data ---
        let mut toc = Vec::new();
        let mut header_text_buffer = String::new();
        let mut current_level: Option<HeadingLevel> = None;
        let mut counters = [0; 6]; // For H1 to H6
        let mut unique_ids = HashMap::new();

        for event in &events {
            if let Event::Start(Tag::Heading { level, .. }) = event {
                current_level = Some(*level);
                header_text_buffer.clear();
            } else if let Event::End(TagEnd::Heading(_)) = event {
                if let Some(level) = current_level.take() {
                    let level_index = (level as usize) - 1;
                    counters[level_index] += 1;
                    // Reset counters for deeper levels
                    ((level_index + 1)..6).for_each(|i| {
                        counters[i] = 0;
                    });

                    let number_parts: Vec<String> = counters[..=level_index]
                        .iter()
                        .filter(|&&c| c > 0)
                        .map(|c| c.to_string())
                        .collect();
                    let number = number_parts.join(".");

                    // Process the raw header text to get clean display text for the TOC.
                    let display_text =
                        self.extract_display_text_from_wikilinks(&header_text_buffer);

                    // Slugify the clean display text for a more readable anchor ID.
                    let mut slug = slug::slugify(&display_text);
                    let original_slug = slug.clone();
                    let mut counter = 1;
                    while unique_ids.contains_key(&slug) {
                        slug = format!("{}-{}", original_slug, counter);
                        counter += 1;
                    }
                    unique_ids.insert(slug.clone(), ());

                    toc.push(TocEntry {
                        number,
                        text: display_text,
                        level: level as u32,
                        id: slug,
                    });
                }
            } else if current_level.is_some() {
                if let Event::Text(text) | Event::Code(text) = event {
                    header_text_buffer.push_str(text);
                }
            }
        }

        // --- Pass 2: Process Events for HTML Rendering ---
        let mut events_before_toc = Vec::new();
        let mut events_after_toc = Vec::new();
        // `text_buffer` will temporarily store the content of consecutive `Text` events.
        let mut text_buffer = String::new();
        let mut found_first_header = false;
        let mut header_idx = 0;

        // --- 2a. The Flushing Closure ---
        // This closure contains the logic to process the contents of `text_buffer`.
        // It's called whenever we need to "flush" the text we've gathered.
        let flush_text_buffer = |buffer: &mut String, events: &mut Vec<Event>| {
            // If the buffer is empty, there's nothing to do.
            if buffer.is_empty() {
                return;
            }

            // Process all custom syntax on the buffer and push the result as a single HTML event.
            // This is more efficient than splitting the text into multiple events.
            let final_html = self.render_custom_syntax_in_string(buffer);
            events.push(Event::Html(final_html.into()));

            // Reset the buffer so it's ready for the next block of text.
            buffer.clear();
        };

        // --- 2b. The Main Event Loop ---
        for event in events {
            let current_event_list = if found_first_header {
                &mut events_after_toc
            } else {
                &mut events_before_toc
            };

            match event {
                // If the event is text, add it to our buffer. Don't process it yet.
                Event::Text(text) => {
                    text_buffer.push_str(&text);
                }
                // If the event is raw HTML, process its content for wikilinks.
                Event::Html(html_content) => {
                    // First, flush any pending text to maintain order.
                    flush_text_buffer(&mut text_buffer, current_event_list);
                    // Now, process the HTML content itself for our custom syntax.
                    let processed_html = self.render_custom_syntax_in_string(&html_content);
                    // Push the processed HTML back into the event stream.
                    current_event_list.push(Event::Html(processed_html.into()));
                }
                Event::Start(Tag::Heading { level, .. }) => {
                    // This signals the end of our consecutive text block. So, first, we flush.
                    flush_text_buffer(&mut text_buffer, current_event_list);
                    found_first_header = true;

                    // Get the pre-calculated ID for this header from our TOC data.
                    let id = toc
                        .get(header_idx)
                        .map_or_else(|| CowStr::from(""), |entry| CowStr::from(entry.id.clone()));
                    header_idx += 1;
                    // Now that we've found the header, all subsequent events go to the 'after' list.
                    events_after_toc.push(Event::Start(Tag::Heading {
                        level,
                        id: Some(id),
                        classes: vec![],
                        attrs: vec![],
                    }));
                }
                // If the event is *anything else* (an end tag, code event, etc.),
                // it also signals the end of our consecutive text block.
                _ => {
                    // So, first, we flush the text buffer we've built up.
                    flush_text_buffer(&mut text_buffer, current_event_list);
                    // Then, we push the non-text event that triggered the flush.
                    current_event_list.push(event);
                }
            }
        }
        // It's possible for the markdown to end with text, leaving content in the buffer.
        // This final flush ensures that last bit of text gets processed.
        let final_event_list = if found_first_header {
            &mut events_after_toc
        } else {
            &mut events_before_toc
        };
        flush_text_buffer(&mut text_buffer, final_event_list);

        // --- 4. Final HTML Rendering ---

        // Render our new, modified stream of events into the final HTML string.
        let mut html_before = String::new();
        html::push_html(&mut html_before, events_before_toc.into_iter());

        let mut html_after = String::new();
        html::push_html(&mut html_after, events_after_toc.into_iter());

        // --- 5. Sanitize HTML ---
        // Sanitize the raw rendered HTML to remove any malicious user-written
        // tags (like <script>) or attributes (like onerror) and prevent XSS.
        let sanitized_before = sanitizer::sanitize_html(&html_before);
        let sanitized_after = sanitizer::sanitize_html(&html_after);

        // --- 6. Post-Processing for Embedded Images ---
        // Now that the HTML is safe, find the remaining <img> tags and convert
        // their local src paths to Base64 data URLs.
        let final_before = self.process_body_image_tags(&sanitized_before);
        let final_after = self.process_body_image_tags(&sanitized_after);

        (final_before, final_after, toc)
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
            html_before_toc: rendered_html,
            html_after_toc: String::new(),
            toc: vec![],
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
        let link_path = root.join("link.md");
        fs::write(&link_path, "content").unwrap();

        // Create and scan the indexer
        let mut indexer = Indexer::new(root);
        indexer.scan_vault(root).unwrap();

        let indexer_arc = Arc::new(RwLock::new(indexer));
        let renderer = Renderer::new(indexer_arc, root.to_path_buf());

        (renderer, page1_path)
    }

    #[test]
    fn test_render_custom_syntax_in_string() {
        let (renderer, page1_path) = setup_renderer();
        let content = "Link to [[Page One]] and a ||spoiler||.";
        let rendered = renderer.render_custom_syntax_in_string(content);

        let expected_path_str = page1_path.to_string_lossy();
        let expected = format!(
            "Link to <a href=\"#\" class=\"internal-link\" data-path=\"{}\">Page One</a> and a <span class=\"spoiler\">spoiler</span>.",
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

        // Check body - since there's no header, it should all be in html_before_toc
        let expected_body_html = format!(
            "<p>Body content with <a href=\"#\" class=\"internal-link\" data-path=\"{}\">an alias</a>.</p>\n",
            expected_path_str
        );
        assert_eq!(result.html_before_toc, expected_body_html);
        assert!(result.html_after_toc.is_empty());
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
        assert_eq!(result.html_before_toc, "<p>Body.</p>\n");
    }

    #[test]
    fn test_render_page_preview_no_frontmatter() {
        let (renderer, _) = setup_renderer();
        let content = "# Title\nJust body content, with a [[Broken Link]].";
        let result = renderer.render_page_preview(content).unwrap();

        // Frontmatter should be null
        assert!(result.processed_frontmatter.is_null());

        // Body should be rendered with the broken link.
        // Since the content starts with a header, html_before_toc should be empty.
        let expected_html = "<p>Just body content, with a <a href=\"#\" class=\"internal-link broken\" data-target=\"Broken Link\">Broken Link</a>.</p>\n";
        assert!(result.html_before_toc.is_empty());
        assert_eq!(
            result.html_after_toc,
            format!("<h1 id=\"title\">Title</h1>\n{}", expected_html)
        );
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
        assert_eq!(result.html_before_toc, expected_html);
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

        let (body_html, _, _) = renderer.render_body_to_html_with_toc(content);
        let expected_path_str = page1_path.to_string_lossy();

        // The expected HTML now asserts that wikilinks ARE rendered inside
        // indented and fenced code blocks, but NOT inside inline code.
        let expected_html = format!(
            "<p>Case 1: Indented with 4 spaces</p>\n<pre><code><a href=\"#\" class=\"internal-link\" data-path=\"{0}\">Page One</a>\n</code></pre>\n<p>Case 2: Fenced with backticks</p>\n<pre><code><a href=\"#\" class=\"internal-link\" data-path=\"{0}\">Page One</a>\n</code></pre>\n<p>Case 3: Inline with single backticks <code>[[Page One]]</code>.</p>\n<p>A normal link for comparison: <a href=\"#\" class=\"internal-link\" data-path=\"{0}\">Page One</a>.</p>\n",
            expected_path_str
        );

        assert_eq!(body_html, expected_html);
    }

    #[test]
    fn test_spoilers_do_render_internal_wikilinks() {
        let (renderer, page1_path) = setup_renderer();
        let link_path = page1_path.parent().unwrap().join("link.md");
        let content = r#"
A normal link to [[Page One]].
A spoiler with a ||secret [[link]] inside||.
"#;
        let (body_html, _, _) = renderer.render_body_to_html_with_toc(content);
        let page1_path_str = page1_path.to_string_lossy();
        let link_path_str = link_path.to_string_lossy();

        let expected_html = format!(
            "<p>A normal link to <a href=\"#\" class=\"internal-link\" data-path=\"{0}\">Page One</a>.\nA spoiler with a <span class=\"spoiler\">secret <a href=\"#\" class=\"internal-link\" data-path=\"{1}\">link</a> inside</span>.</p>\n",
            page1_path_str,
            link_path_str
        );

        assert_eq!(body_html, expected_html);
    }

    #[test]
    fn test_toc_generation_and_html_split() {
        let (renderer, _) = setup_renderer();
        let content = r#"
Summary paragraph before any headers.

# Header 1
Some text.
## Header 1.1
More text.
# Header 2
Final text.
"#;
        let result = renderer.render_page_preview(content).unwrap();

        // Test TOC structure
        assert_eq!(result.toc.len(), 3);
        assert_eq!(result.toc[0].number, "1");
        assert_eq!(result.toc[0].text, "Header 1");
        assert_eq!(result.toc[0].id, "header-1");
        assert_eq!(result.toc[1].number, "1.1");
        assert_eq!(result.toc[1].text, "Header 1.1");
        assert_eq!(result.toc[1].id, "header-1-1");
        assert_eq!(result.toc[2].number, "2");
        assert_eq!(result.toc[2].text, "Header 2");
        assert_eq!(result.toc[2].id, "header-2");

        // Test HTML split
        assert_eq!(
            result.html_before_toc.trim(),
            "<p>Summary paragraph before any headers.</p>"
        );
        assert!(result
            .html_after_toc
            .contains("<h1 id=\"header-1\">Header 1</h1>"));
        assert!(result
            .html_after_toc
            .contains("<h2 id=\"header-1-1\">Header 1.1</h2>"));
        assert!(result
            .html_after_toc
            .contains("<h1 id=\"header-2\">Header 2</h1>"));
    }

    #[test]
    fn test_toc_with_duplicate_headers() {
        let (renderer, _) = setup_renderer();
        let content = "# 똑같은 제목\n## 똑같은 제목\n# 똑같은 제목"; // Using non-ASCII to test slugify
        let result = renderer.render_page_preview(content).unwrap();

        assert_eq!(result.toc.len(), 3);
        // The slugify crate transliterates non-ASCII characters.
        assert_eq!(result.toc[0].id, "ddoggateun-jemog");
        assert_eq!(result.toc[1].id, "ddoggateun-jemog-1"); // Should be unique
        assert_eq!(result.toc[2].id, "ddoggateun-jemog-2"); // Should be unique
    }

    #[test]
    fn test_toc_with_no_headers() {
        let (renderer, _) = setup_renderer();
        let content = "This page has no headers. Just a paragraph.";
        let result = renderer.render_page_preview(content).unwrap();

        assert!(result.toc.is_empty());
        assert_eq!(
            result.html_before_toc.trim(),
            "<p>This page has no headers. Just a paragraph.</p>"
        );
        assert!(result.html_after_toc.is_empty());
    }
}
