//! Markdown parsing with custom extensions for D&D worldbuilding

use crate::error::Result;
use pulldown_cmark::{html, Options, Parser};
use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;

/// Structure representing parsed markdown content
#[derive(Debug, Default, Serialize)]
pub struct ParsedMarkdown {
    /// HTML rendered from markdown
    pub html: String,
    /// Extracted frontmatter (if present)
    pub frontmatter: Option<HashMap<String, String>>,
    /// Tags found in the content (without the '#')
    pub tags: Vec<String>,
    /// Wikilinks found in the content (without the '[[' and ']]')
    pub wikilinks: Vec<String>,
    /// Clean markdown without processing artifacts
    pub clean_md: String,
}

/// Parses markdown content with custom D&D extensions
///
/// Handles:
/// - Frontmatter infoboxes (```infobox ... ```)
/// - Tags (#tag-name)
/// - Wikilinks ([[Page Name]])
/// - Image paths
pub fn parse_markdown(content: &str) -> Result<ParsedMarkdown> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);

    // Extract frontmatter if present
    let (frontmatter, clean_content) = extract_frontmatter(content)?;

    // Extract tags and wikilinks
    let (tags, wikilinks, processed_content) = extract_tags_and_links(&clean_content)?;

    // Parse markdown to HTML
    let parser = Parser::new_ext(&processed_content, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);

    Ok(ParsedMarkdown {
        html: html_output,
        frontmatter,
        tags,
        wikilinks,
        clean_md: clean_content,
    })
}

/// Extracts YAML frontmatter from markdown
fn extract_frontmatter(content: &str) -> Result<(Option<HashMap<String, String>>, String)> {
    let re = Regex::new(r"^```infobox\s*\n([\s\S]*?)```")?;

    if let Some(caps) = re.captures(content) {
        let yaml_content = caps.get(1).unwrap().as_str();
        let data: HashMap<String, String> = serde_yaml::from_str(yaml_content)?;

        // Remove frontmatter from content
        let clean_content = re.replace(content, "").to_string();
        return Ok((Some(data), clean_content));
    }

    Ok((None, content.to_string()))
}

/// Processes tags and wikilinks in markdown content
fn extract_tags_and_links(content: &str) -> Result<(Vec<String>, Vec<String>, String)> {
    let tag_re = Regex::new(r"#(\w[\w-]+)")?;
    let wiki_re = Regex::new(r"\[\[([^\]]+)\]\]")?;

    let mut tags = Vec::new();
    let mut wikilinks = Vec::new();

    // Find all tags
    for cap in tag_re.captures_iter(content) {
        if let Some(tag) = cap.get(1) {
            tags.push(tag.as_str().to_string());
        }
    }

    // Process wikilinks and replace with markdown links
    let processed_content = wiki_re
        .replace_all(content, |caps: &regex::Captures| {
            if let Some(link) = caps.get(1) {
                let link_text = link.as_str();
                wikilinks.push(link_text.to_string());
                format!("[{}](wiki://{})", link_text, link_text)
            } else {
                caps[0].to_string()
            }
        })
        .to_string();

    // Deduplicate tags
    tags.sort();
    tags.dedup();

    // Deduplicate wikilinks
    wikilinks.sort();
    wikilinks.dedup();

    Ok((tags, wikilinks, processed_content))
}
