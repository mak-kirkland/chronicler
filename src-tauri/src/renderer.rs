//! Markdown and Wikilink rendering engine.
//!
//! This module is the heart of the content display system. It is responsible for:
//! 1. Parsing Markdown text into a stream of events using `pulldown-cmark`.
//! 2. Transforming custom syntax like `[[wikilinks]]`, `||spoilers||`, and `{{inserts}}` into HTML.
//! 3. Generating a Table of Contents (TOC) from page headers.
//! 4. Handling the recursive rendering of embedded files ("inserts" or transclusions).
//! 5. Post-processing the final HTML to sanitize it and correctly handle image paths.

use crate::config::IMAGES_DIR_NAME;
use crate::error::ChroniclerError;
use crate::models::{Backlink, FullPageData, TocEntry, VaultAsset};
use crate::sanitizer;
use crate::utils::file_stem_string;
use crate::wikilink::WIKILINK_RE;
use crate::{error::Result, indexer::Indexer, models::RenderedPage, parser};
use base64::{engine::general_purpose, Engine as _};
use html_escape::decode_html_entities;
use parking_lot::RwLock;
use path_clean::PathClean;
use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use pulldown_cmark::{html, CowStr, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use regex::{Captures, Regex};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock};

// A character set for percent-encoding that ensures slashes and colons are encoded.
// This matches the behavior of the frontend `convertFileSrc` function.
const ENCODE_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~');

/// Spoiler regex pattern.
/// Captures: 1: content
/// Format: ||content||
static SPOILER_RE: LazyLock<Regex> = LazyLock::new(|| {
    // The `.*?` is a non-greedy match to correctly handle multiple spoilers on one line.
    Regex::new(r"\|\|(.*?)\|\|").unwrap()
});

/// HTML img tag regex pattern.
/// Captures: 1: src attribute content, 2: all other attributes
/// Used to find and replace local image paths while preserving other attributes.
static IMG_TAG_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<img src="([^"]+)"([^>]*)>"#).unwrap());

/// Class attribute regex pattern.
/// Captures: 1: `class="`, 2: attribute value
/// Used to find and modify an existing class attribute.
static CLASS_ATTR_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(class=")([^"]*)""#).unwrap());

/// Wikilink Image regex pattern.
/// Captures: 1: target/filename, 2: alias/alt-text
/// Format: ![[filename.png|alt text]]
static WIKILINK_IMAGE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"!\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]"#).unwrap());

/// Insert/Transclusion regex pattern.
/// Captures: 'path': the path to the file, 'attrs': an optional string of attributes like `| title="My Title" | hidden`
/// Format: {{insert: path/to/file.md | title="My Title" | hidden}}
static INSERT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?x) # Enable comments and insignificant whitespace
        \{\{\s*insert:\s*
        # Capture group 'path': The file path. Non-greedy, ends with non-whitespace.
        (?P<path>.*?\S)
        \s*
        # Capture group 'attrs': The optional attributes string starting with a pipe.
        (?P<attrs>(?:\|.*?)?)
        \s*\}\}
        "#,
    )
    .unwrap()
});

/// Insert Title Attribute regex pattern.
/// Captures: 1: double-quoted title, 2: single-quoted title
/// Format: title="My Title" or title='My Title'
static INSERT_TITLE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"^title\s*=\s*(?:"([^"]*)"|'([^']*)')$"#).unwrap());

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

/// Converts a `Path` or `PathBuf` into a web-standard string with forward slashes.
/// This ensures consistency in all path data sent to the frontend.
fn path_to_web_str(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

impl Renderer {
    /// Creates a new Renderer.
    pub fn new(indexer: Arc<RwLock<Indexer>>, vault_path: PathBuf) -> Self {
        Self {
            indexer,
            vault_path,
        }
    }

    /// Resolves an image path with a clear priority order for maximum flexibility.
    ///
    /// The resolution logic is:
    /// 1. **Absolute Path:** If the input is an absolute path, it is used directly.
    ///    This allows linking to images outside the vault.
    /// 2. **Indexed Filename:** If the input is a simple filename (e.g., "map.png"),
    ///    it is looked up in the `media_resolver` index. This is the new, preferred method.
    /// 3. **Relative Path (Legacy):** As a fallback for backward compatibility, the input
    ///    is treated as a path relative to the vault's `images` subdirectory.
    ///
    /// The final path is canonicalized to resolve symbolic links.
    fn resolve_image_path(&self, path_str: &str) -> PathBuf {
        let path = Path::new(path_str);
        let mut resolved_path;

        // --- Priority 1: Absolute Path ---
        if path.is_absolute() {
            resolved_path = path.to_path_buf();
        } else {
            // --- Priority 2: Indexed Filename Lookup ---
            let indexer = self.indexer.read();
            // The path string itself is treated as a potential filename.
            if let Some(indexed_path) = indexer.media_resolver.get(&path_str.to_lowercase()) {
                resolved_path = indexed_path.clone();
            } else {
                // Release the read lock as soon as possible.
                drop(indexer);

                // --- Priority 3: Legacy Relative Path Fallback ---
                resolved_path = self.vault_path.join(IMAGES_DIR_NAME).join(path);
            }
        }

        // Final canonicalization step to resolve symlinks and '..' segments.
        // We use a clean() fallback because canonicalize will fail if the file doesn't exist.
        resolved_path = match dunce::canonicalize(&resolved_path) {
            Ok(canonical) => canonical,
            Err(_) => resolved_path.clean(),
        };

        resolved_path
    }

    /// Processes an image source path, returning a correctly formatted Tauri v2 asset URL.
    /// This function uses conditional compilation to handle platform-specific webview requirements.
    pub fn convert_image_path_to_asset_url(&self, path_str: &str) -> String {
        let absolute_path = self.resolve_image_path(path_str);

        // This block compiles ONLY on Windows
        #[cfg(windows)]
        {
            // On Windows, WebView2 expects the http:// scheme for the asset protocol.
            let path_string = absolute_path.to_string_lossy().replace('\\', "/");
            let encoded_path = utf8_percent_encode(&path_string, ENCODE_SET);
            return format!("http://asset.localhost/{}", encoded_path);
        }

        // This block compiles on any non-Windows OS (Linux, macOS)
        #[cfg(not(windows))]
        {
            // On Linux and macOS, WebKit expects the custom asset:// scheme.
            let path_string = absolute_path.to_string_lossy().to_string();
            let encoded_path = utf8_percent_encode(&path_string, ENCODE_SET);
            return format!("asset://localhost/{}", encoded_path);
        }
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

    /// Processes the `image` field from the frontmatter, preparing it for the frontend.
    ///
    /// This function handles all logic for the infobox image:
    /// - It can process a single string: `image: "cover.jpg"`
    /// - It can process an array of strings: `image: ["cover.jpg", "screenshot.png"]`
    /// - It can process an array of arrays with paths and optional captions:
    ///   `image: [["us.jpg", "USA"], ["jp.jpg"]]`
    ///
    /// It populates three fields for the frontend:
    /// - `images`: A list of processed image sources (asset URLs or data URLs).
    /// - `image_paths`: A list of the absolute file paths for each image.
    /// - `image_captions`: A list of captions, with `null` for images without one.
    fn process_infobox_images(&self, map: &mut Map<String, Value>, image_value: &Value) {
        let mut image_srcs = Vec::new();
        let mut image_absolute_paths = Vec::new();
        let mut image_captions = Vec::new();

        // Helper closure to process a single path string.
        let mut process_image_path = |path_str: &str| {
            let resolved_path = self.resolve_image_path(path_str);

            // Apply the hybrid logic: use the best method based on the path type.
            let image_src = if resolved_path.starts_with(&self.vault_path) {
                // If the resolved path is inside the vault, use the performant asset protocol.
                self.convert_image_path_to_asset_url(&path_to_web_str(&resolved_path))
            } else {
                // For absolute paths outside the vault, use the secure Base64 fallback.
                self.convert_image_path_to_data_url(&path_to_web_str(&resolved_path))
            };
            image_srcs.push(Value::String(image_src));

            // Also resolve the absolute path for the frontend to use (e.g., for an "open file" button).
            image_absolute_paths.push(Value::String(resolved_path.to_string_lossy().to_string()));
        };

        match image_value {
            Value::String(s) => {
                process_image_path(s);
                image_captions.push(Value::Null); // No caption for a single image string.
            }
            Value::Array(arr) => {
                for item in arr {
                    match item {
                        Value::String(s) => {
                            process_image_path(s);
                            image_captions.push(Value::Null); // No caption for a simple string in an array.
                        }
                        Value::Array(inner_arr) => {
                            // The inner array should have the path at index 0 and optional caption at index 1.
                            if let Some(path_val) = inner_arr.first().and_then(Value::as_str) {
                                process_image_path(path_val);
                                // Get the caption from index 1 if it exists, otherwise use null.
                                let caption = inner_arr
                                    .get(1)
                                    .and_then(Value::as_str)
                                    .map_or(Value::Null, |c| {
                                        Value::String(self.render_frontmatter_string_as_html(c))
                                    });
                                image_captions.push(caption);
                            }
                        }
                        _ => {
                            // Ignore other value types in the array, like objects or numbers.
                        }
                    }
                }
            }
            _ => {
                // If the value is neither a string nor an array, do nothing.
            }
        }

        // The key for the frontend is `images`, which now contains a mix of asset URLs and data URLs.
        map.insert("images".to_string(), Value::Array(image_srcs));
        map.insert(
            "image_paths".to_string(),
            Value::Array(image_absolute_paths),
        );
        map.insert("image_captions".to_string(), Value::Array(image_captions));
    }

    /// A post-processing step that finds all standard HTML `<img ...>` tags
    /// in a block of rendered HTML, converts their `src` paths, and ensures
    /// they have the `embedded-image` class while preserving other attributes.
    fn process_body_image_tags(&self, html: &str) -> String {
        IMG_TAG_RE
            .replace_all(html, |caps: &Captures| {
                // 1. Get the original src path and all other attributes.
                let encoded_path_str = &caps[1];
                let other_attrs = &caps[2];

                // If the path is already an external URL, leave it alone.
                if encoded_path_str.starts_with("http://")
                    || encoded_path_str.starts_with("https://")
                {
                    // Reconstruct the original tag and do nothing else.
                    return format!(r#"<img src="{}"{}>"#, encoded_path_str, other_attrs);
                }

                // 2. Decode the path string.
                let html_decoded_path = decode_html_entities(encoded_path_str);
                let final_path_str = percent_decode_str(&html_decoded_path)
                    .decode_utf8_lossy()
                    .to_string();

                let resolved_path = self.resolve_image_path(&final_path_str);

                // 3. Check if the path is inside the vault or external and choose the best method.
                let image_src = if resolved_path.starts_with(&self.vault_path) {
                    // If it's inside the vault, use the performant asset protocol.
                    self.convert_image_path_to_asset_url(&path_to_web_str(&resolved_path))
                } else {
                    // If it's an absolute path outside the vault, convert it to a Data URL.
                    self.convert_image_path_to_data_url(&path_to_web_str(&resolved_path))
                };

                // 4. Handle the class attribute, preserving all other attributes.
                let final_other_attrs =
                    if let Some(class_caps) = CLASS_ATTR_RE.captures(other_attrs) {
                        // A class attribute was found.
                        let existing_classes = &class_caps[2];
                        if existing_classes
                            .split_whitespace()
                            .any(|c| c == "embedded-image")
                        {
                            // The class is already present, so no changes are needed.
                            other_attrs.to_string()
                        } else {
                            // The class is not present; add it to the existing list.
                            // The replacement adds a space before our class.
                            CLASS_ATTR_RE
                                .replace(other_attrs, r#"$1$2 embedded-image""#)
                                .to_string()
                        }
                    } else {
                        // No class attribute was found. Add it, preserving all other attributes.
                        format!(r#"{} class="embedded-image""#, other_attrs)
                    };

                // 5. Reconstruct the full <img> tag with the new src and modified attributes.
                format!(r#"<img src="{}"{}>"#, image_src, final_other_attrs)
            })
            .to_string()
    }

    /// Renders a string of Markdown to HTML, but strips the outer `<p>` tags.
    /// This is useful for rendering inline content like in infobox fields.
    fn render_inline_markdown(&self, markdown: &str) -> String {
        let mut options = Options::empty();
        options.insert(Options::ENABLE_STRIKETHROUGH);

        let parser = Parser::new_ext(markdown, options);

        // Filter out the paragraph tags to prevent wrapping every field in <p>...</p>
        let events = parser.filter(|event| {
            !matches!(
                event,
                Event::Start(Tag::Paragraph) | Event::End(TagEnd::Paragraph)
            )
        });

        let mut html_output = String::new();
        html::push_html(&mut html_output, events);
        html_output
    }

    /// Processes a single string value from the frontmatter, rendering any custom syntax
    /// (wikilinks, spoilers, image tags) into final HTML.
    fn render_frontmatter_string_as_html(&self, text: &str) -> String {
        // 1. Process custom syntax first (wikilinks, spoilers, etc.)
        // An empty Vec is passed for the rendering stack as frontmatter cannot have inserts.
        let with_custom_syntax = self
            .render_custom_syntax_in_string(text, &mut Vec::new())
            .unwrap_or_else(|e| e.to_string());

        // 2. Render standard Markdown on the result of step 1.
        let with_markdown = self.render_inline_markdown(&with_custom_syntax);

        // 3. Sanitize the rendered HTML to prevent XSS.
        let with_sanitized = sanitizer::sanitize_html(&with_markdown);

        // 4. Process any <img> tags to embed images. Must do this AFTER sanitizing.
        self.process_body_image_tags(&with_sanitized)
    }

    /// Takes a parsed serde_json::Value representing the frontmatter, and recursively
    /// processes all string fields to render custom syntax. This function modifies
    /// the `Value` in place.
    fn process_frontmatter(&self, frontmatter: &mut Value) {
        if let Value::Object(map) = frontmatter {
            // Take ownership of the original map's content, leaving the original empty.
            let original_map = std::mem::take(map);
            // Create a new map to hold the processed key-value pairs in the correct order.
            let mut processed_map = Map::new();

            // Iterate over the key-value pairs from the original map, preserving their order.
            for (key, value) in original_map {
                if key == "image" {
                    // When we encounter the 'image' key, process it immediately.
                    // This function will add the 'images' and 'image_paths' keys
                    // to our new `processed_map` at the correct position.
                    self.process_infobox_images(&mut processed_map, &value);
                } else {
                    // For all other keys, process them and insert into the new map.
                    let mut new_value = value;
                    if let Value::String(s) = &new_value {
                        new_value = Value::String(self.render_frontmatter_string_as_html(s));
                    } else if let Value::Array(arr) = &mut new_value {
                        for item in arr.iter_mut() {
                            if let Value::String(s) = item {
                                *item = Value::String(self.render_frontmatter_string_as_html(s));
                            }
                        }
                    }
                    processed_map.insert(key, new_value);
                }
            }

            // Replace the (now empty) original map with our correctly ordered processed map.
            *map = processed_map;
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
        let (html_before_toc, html_after_toc, toc) =
            self.render_body_to_html_with_toc(body, &mut Vec::new())?;

        // 4. Return the complete structure.
        Ok(RenderedPage {
            processed_frontmatter: frontmatter_json,
            html_before_toc,
            html_after_toc,
            toc,
        })
    }

    /// Helper function to process a single `{{insert: ...}}` match.
    /// This function contains all the logic for resolving, rendering, and error-handling
    /// an individual insert, which simplifies the main `render_custom_syntax_in_string` function.
    fn process_single_insert(
        &self,
        caps: &Captures,
        rendering_stack: &mut Vec<PathBuf>,
    ) -> Result<String> {
        // 1. Capture the target name (e.g., "Count Viscar") and attributes string.
        let target = caps.name("path").map_or("", |m| m.as_str()).trim();
        let attrs_str = caps.name("attrs").map_or("", |m| m.as_str());

        // 2. Parse attributes like `title="..."` and `hidden` from the attributes string.
        let mut title: Option<&str> = None;
        let mut is_hidden = false;
        let mut is_centered = false;
        let mut is_borderless = false;

        // The attributes string may start with a pipe, so we trim it and then split by the pipe.
        for attr in attrs_str.trim_start_matches('|').split('|') {
            let part = attr.trim();
            if part == "hidden" {
                is_hidden = true;
            } else if part == "centered" {
                is_centered = true;
            } else if part == "borderless" {
                is_borderless = true;
            } else if let Some(title_caps) = INSERT_TITLE_RE.captures(part) {
                // Get the title from either the double-quoted or single-quoted capture group.
                title = title_caps
                    .get(1)
                    .or_else(|| title_caps.get(2))
                    .map(|m| m.as_str());
            }
        }

        // 3. Use the indexer to find the full path from the target name.
        let indexer = self.indexer.read();
        let normalized_target = target.to_lowercase();
        // We clone the path to release the read lock on the indexer quickly.
        let maybe_path = indexer.link_resolver.get(&normalized_target).cloned();
        drop(indexer);

        // 4. Process the result of the path lookup.
        if let Some(insert_path) = maybe_path {
            // --- Logic for a successfully found insert path ---

            // a. Circular Dependency Check: Prevent infinite recursion.
            if rendering_stack.contains(&insert_path) {
                return Err(ChroniclerError::CircularInsert(insert_path.clone()));
            }

            // b. Read the content of the target file.
            match fs::read_to_string(&insert_path) {
                Ok(content) => {
                    let (_, body) = parser::extract_frontmatter(&content);
                    // --- Recursion Step ---
                    // Push the current path onto the stack to track the recursion depth.
                    rendering_stack.push(insert_path.clone());
                    // Recursively render the body of the inserted file.
                    let (before_toc, after_toc, _) =
                        self.render_body_to_html_with_toc(body, rendering_stack)?;
                    let rendered_html = before_toc + &after_toc;
                    // Pop from the stack after the recursive call returns successfully.
                    rendering_stack.pop();

                    if is_borderless {
                        // If 'borderless' is specified, just return the raw rendered HTML
                        // and nothing else.
                        Ok(rendered_html)
                    } else {
                        // c. Determine the title: use the one from syntax, or default to the file name.
                        let default_title = file_stem_string(&insert_path);
                        let final_title = title.unwrap_or(&default_title);

                        // d. Build the final HTML for the insert container, accounting for all attributes.
                        let container_class = if is_hidden {
                            "insert-container collapsed"
                        } else {
                            "insert-container"
                        };
                        let button_text = if is_hidden { "[show]" } else { "[hide]" };
                        let title_wrapper_class = if is_centered {
                            "insert-title-wrapper centered"
                        } else {
                            "insert-title-wrapper"
                        };

                        let final_html = format!(
                            r#"<div class="{}">
                                <div class="insert-header">
                                    <span class="{}">
                                        <span>{}</span>
                                    </span>
                                    <button class="insert-toggle">{}</button>
                                </div>
                               <div class="insert-content">{}</div>
                            </div>"#,
                            container_class,
                            title_wrapper_class,
                            final_title,
                            button_text,
                            rendered_html
                        );

                        Ok(final_html)
                    }
                }
                Err(_) => {
                    // This handles the case where a file exists in the index but is unreadable.
                    let error_html = format!(
                        "<div class=\"error-box\">Could not read insert: {}</div>",
                        html_escape::encode_text(&insert_path.to_string_lossy())
                    );
                    Ok(error_html)
                }
            }
        } else {
            // --- This handles a "broken" insert link ---
            // If the target wasn't found in the link_resolver, show an error.
            let error_html = format!(
                "<div class=\"error-box\">Insert not found: {}</div>",
                html_escape::encode_text(target)
            );
            Ok(error_html)
        }
    }

    /// Replaces all custom syntax (spoilers, wikilinks, inserts) in a string with valid HTML.
    fn render_custom_syntax_in_string(
        &self,
        text: &str,
        rendering_stack: &mut Vec<PathBuf>,
    ) -> Result<String> {
        // 1. Process spoilers first: ||spoiler||
        let with_spoilers = SPOILER_RE.replace_all(text, |caps: &Captures| {
            format!("<span class=\"spoiler\">{}</span>", &caps[1])
        });

        // 2. Process image wikilinks: ![[image.png|alt text]]
        let with_images = WIKILINK_IMAGE_RE.replace_all(&with_spoilers, |caps: &Captures| {
            let path_str = caps.get(1).map_or("", |m| m.as_str()).trim();
            let alt_text = caps.get(2).map_or(path_str, |m| m.as_str().trim());

            // Generate a standard <img> tag. This will be post-processed later
            // by `process_body_image_tags` to handle the src path correctly.
            format!(
                r#"<img src="{}" alt="{}">"#,
                // Use the normalized path directly as the src
                path_str,
                html_escape::encode_double_quoted_attribute(alt_text)
            )
        });

        // 3. Process inserts: {{insert: Page Name}}
        // The `try_fold` iterates through all matches, replacing them one by one.
        // It's wrapped in a Result to allow any step in the chain to fail.
        let with_inserts_result: Result<String> =
            INSERT_RE
                .captures_iter(&with_images)
                .try_fold(with_images.to_string(), |acc, caps| {
                    // Get the full text of the matched insert syntax (e.g., "{{insert: ...}}")
                    let whole_match = caps.get(0).unwrap().as_str();
                    // Call our dedicated helper function to get the replacement HTML.
                    let replacement_html = self.process_single_insert(&caps, rendering_stack)?;
                    // Replace the original syntax in the accumulated string with the generated HTML.
                    Ok(acc.replace(whole_match, &replacement_html))
                });

        let with_inserts = with_inserts_result?;

        // 4. Finally, process standard wikilinks: [[Page Name|alias]]
        let indexer = self.indexer.read();
        let final_html = WIKILINK_RE
            .replace_all(&with_inserts, |caps: &Captures| {
                let target = caps.get(1).map_or("", |m| m.as_str()).trim();
                let section = caps.get(2).map(|m| m.as_str().trim());
                let alias = caps.get(3).map(|m| m.as_str().trim()).unwrap_or(target);
                let normalized_target = target.to_lowercase();

                let href = if let Some(sec) = section {
                    let id = slug::slugify(sec);
                    format!("#{}", id)
                } else {
                    "#".to_string()
                };

                if let Some(path) = indexer.link_resolver.get(&normalized_target) {
                    let web_path = path_to_web_str(path);
                    format!(
                        "<a href=\"{}\" class=\"internal-link\" data-path=\"{}\">{}</a>",
                        href, web_path, alias
                    )
                } else {
                    format!(
                        "<a href=\"#\" class=\"internal-link broken\" data-target=\"{}\">{}</a>",
                        target, // Use the original target name for creation
                        alias
                    )
                }
            })
            .to_string();

        Ok(final_html)
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
    fn render_body_to_html_with_toc(
        &self,
        markdown: &str,
        rendering_stack: &mut Vec<PathBuf>,
    ) -> Result<(String, String, Vec<TocEntry>)> {
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
        let flush_text_buffer = |buffer: &mut String,
                                 events: &mut Vec<Event>,
                                 stack: &mut Vec<PathBuf>|
         -> Result<()> {
            // If the buffer is empty, there's nothing to do.
            if buffer.is_empty() {
                return Ok(());
            }

            // Process all custom syntax on the buffer and push the result as a single HTML event.
            // This is more efficient than splitting the text into multiple events.
            let final_html = self.render_custom_syntax_in_string(buffer, stack)?;
            events.push(Event::Html(final_html.into()));

            // Reset the buffer so it's ready for the next block of text.
            buffer.clear();
            Ok(())
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
                    flush_text_buffer(&mut text_buffer, current_event_list, rendering_stack)?;
                    // Now, process the HTML content itself for our custom syntax.
                    let processed_html =
                        self.render_custom_syntax_in_string(&html_content, rendering_stack)?;
                    // Push the processed HTML back into the event stream.
                    current_event_list.push(Event::Html(processed_html.into()));
                }
                Event::Start(Tag::Heading { level, .. }) => {
                    // This signals the end of our consecutive text block. So, first, we flush.
                    flush_text_buffer(&mut text_buffer, current_event_list, rendering_stack)?;
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
                    flush_text_buffer(&mut text_buffer, current_event_list, rendering_stack)?;
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
        flush_text_buffer(&mut text_buffer, final_event_list, rendering_stack)?;

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
        // their local src paths to asset URLs.
        let final_before = self.process_body_image_tags(&sanitized_before);
        let final_after = self.process_body_image_tags(&sanitized_after);

        Ok((final_before, final_after, toc))
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

        // Canonicalize the path before lookup to handle symlinks (like /home -> /var/home)
        let page_path = PathBuf::from(path);
        let canonical_path = dunce::canonicalize(&page_path).unwrap_or(page_path);

        let page = indexer
            .assets
            .get(&canonical_path)
            .and_then(|asset| match asset {
                VaultAsset::Page(p) => Some(p),
                _ => None,
            })
            .ok_or_else(|| ChroniclerError::FileNotFound(canonical_path.clone()))?;

        let mut backlinks: Vec<Backlink> = page
            .backlinks
            .iter()
            .filter_map(|backlink_path| {
                indexer
                    .assets
                    .get(backlink_path)
                    .and_then(|asset| match asset {
                        VaultAsset::Page(p) => {
                            // Get the count of links from the source (backlink_path) to the target (page_path)
                            let count = indexer
                                .link_graph
                                .get(backlink_path)
                                .and_then(|targets| targets.get(&canonical_path))
                                .map_or(0, |links| links.len());

                            Some(Backlink {
                                title: p.title.clone(),
                                path: p.path.clone(),
                                count,
                            })
                        }
                        _ => None,
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
        let rendered = renderer
            .render_custom_syntax_in_string(content, &mut Vec::new())
            .unwrap();

        let expected_path_str = path_to_web_str(&page1_path);
        let expected = format!(
            "Link to <a href=\"#\" class=\"internal-link\" data-path=\"{}\">Page One</a> and a <span class=\"spoiler\">spoiler</span>.",
            expected_path_str
        );

        assert_eq!(rendered, expected);
    }

    #[test]
    fn test_frontmatter_markdown_rendering() {
        let (renderer, page1_path) = setup_renderer();
        let content = r#"---
title: "*Italic Title*"
description: "**Bold with a [[Page One]] link**"
---
Body
"#;
        let result = renderer.render_page_preview(content).unwrap();
        let expected_path_str = path_to_web_str(&page1_path);

        assert_eq!(
            result.processed_frontmatter["title"],
            "<em>Italic Title</em>"
        );
        let expected_description = format!(
            "<strong>Bold with a <a href=\"#\" class=\"internal-link\" data-path=\"{}\">Page One</a> link</strong>",
            expected_path_str
        );
        assert_eq!(
            result.processed_frontmatter["description"],
            expected_description
        );
    }

    #[test]
    fn test_render_page_preview_with_valid_frontmatter() {
        let (renderer, page1_path) = setup_renderer();
        let content = "---\ntitle: Test\nrelation: 'A link to [[Page One]]'\n---\nBody content with [[Page One|an alias]].".to_string();

        let result = renderer.render_page_preview(&content).unwrap();
        let expected_path_str = path_to_web_str(&page1_path);

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

        let (body_html, _, _) = renderer
            .render_body_to_html_with_toc(content, &mut Vec::new())
            .unwrap();
        let expected_path_str = path_to_web_str(&page1_path);

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
        let (body_html, _, _) = renderer
            .render_body_to_html_with_toc(content, &mut Vec::new())
            .unwrap();
        let page1_path_str = path_to_web_str(&page1_path);
        let link_path_str = path_to_web_str(&link_path);

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
