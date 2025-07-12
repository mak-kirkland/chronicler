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
        let renderer = Renderer::new(indexer_arc);

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
}
