//! Markdown and Wikilink rendering engine.

use crate::error::ChroniclerError;
use crate::models::{FullPageData, PageHeader};
use crate::wikilink::WIKILINK_RE;
use crate::{error::Result, indexer::Indexer, models::RenderedPage, parser};
use parking_lot::RwLock;
use pulldown_cmark::{html, Options, Parser};
use regex::Captures;
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::sync::Arc;

/// A struct responsible for rendering Markdown content.
#[derive(Debug)]
pub struct Renderer {
    indexer: Arc<RwLock<Indexer>>,
}

impl Renderer {
    /// Creates a new Renderer.
    pub fn new(indexer: Arc<RwLock<Indexer>>) -> Self {
        Self { indexer }
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

        // 2. Process wikilinks within the frontmatter JSON values
        if let Value::Object(map) = &mut frontmatter_json {
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
        }

        // 3. Convert wikilinks in the main body
        let processed_markdown = self.render_wikilinks_in_string(body);

        // 4. Render the main body content to HTML
        let rendered_html = self.render_markdown_to_html(&processed_markdown);

        // 5. Return the complete structure.
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

        let backlinks = page
            .backlinks
            .iter()
            .filter_map(|backlink_path| {
                indexer.pages.get(backlink_path).map(|p| PageHeader {
                    title: p.title.clone(),
                    path: p.path.clone(),
                })
            })
            .collect();

        Ok(FullPageData {
            raw_content,
            rendered_page,
            backlinks,
        })
    }
}
