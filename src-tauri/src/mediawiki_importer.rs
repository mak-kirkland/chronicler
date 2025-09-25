//! MediaWiki XML Dump Importer
//!
//! This module handles the conversion of a MediaWiki XML dump into a
//! collection of Markdown files suitable for a Chronicler vault.

use crate::config::IMAGES_DIR_NAME;
use crate::error::{ChroniclerError, Result};
use crate::importer::get_pandoc_executable_path;
use crate::writer::atomic_write;
use quick_xml::events::Event;
use quick_xml::Reader;
use regex::{Captures, Regex};
use serde::{Deserialize, Serialize};
use serde_yaml::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::LazyLock;
use tauri::AppHandle;
use tracing::{debug, info, instrument, warn};

// --- Regex Constants ---

/// Matches characters that are invalid in most filesystem filenames (e.g., `\ / : * ? " < > |`).
static INVALID_FILENAME_CHARS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"[\\/*?:"<>|]"#).unwrap());

/// A case-insensitive regex to find MediaWiki category links (e.g., `[[Category:Foo]]`)
/// and extract the category name into capture group 1.
static CATEGORY_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\[\[Category:([^\]]+)\]\]").unwrap());

/// A multi-line, case-insensitive regex that matches a MediaWiki template (e.g., an infobox)
/// found at the very beginning of a document. The template's content is in capture group 1.
static INFOBOX_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)\A\s*\{\{([\s\S]+?)\}\}").unwrap());

/// A case-insensitive regex for MediaWiki image links (e.g., `[[File:Foo.jpg|thumb]]`).
/// Captures the filename in group 1 and all parameters (e.g., `|thumb|caption`) in group 2.
static WIKITEXT_IMAGE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\[\[(?:File|Image):([^\|\]]+)((?:\|[^\]]+)*)\]\]").unwrap());

/// Matches Markdown links that Pandoc creates from wikilinks, including the optional ` "wikilink"`
/// title. Captures the link text in group 1 and the target page name in group 2.
static PANDOC_LINK_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\[([^\]]+)\]\(([^)]+?)(?:\s+"wikilink")?\)"#).unwrap());

/// Finds and removes leftover `br /` text fragments from the wikitext.
///
/// Pandoc correctly infers the necessary paragraph break from the header that
/// follows, but its parser can leave this text artifact behind. This regex
/// simply cleans it up by replacing it with an empty string.
static BR_TAG_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)br\s*/").unwrap());

#[derive(Debug, Default)]
struct PageData {
    title: String,
    text: String,
    ns: String, // Namespace of the page
    is_redirect: bool,
}

// Structs for Deserializing MediaWiki Image API Response
#[derive(Debug, Serialize, Deserialize)]
struct ApiImageInfo {
    url: String,
}
#[derive(Debug, Serialize, Deserialize)]
struct ApiPage {
    imageinfo: Option<Vec<ApiImageInfo>>,
}
#[derive(Debug, Serialize, Deserialize)]
struct ApiQuery {
    pages: HashMap<String, ApiPage>,
}
#[derive(Debug, Serialize, Deserialize)]
struct ApiResponse {
    query: ApiQuery,
}

/// Main entry point for the MediaWiki import process.
#[instrument(skip(xml_path, output_dir, app_handle))]
pub async fn import_mediawiki_dump(
    app_handle: AppHandle,
    xml_path: PathBuf,
    output_dir: PathBuf,
) -> Result<Vec<PathBuf>> {
    info!("Starting MediaWiki XML import from {:?}", xml_path);

    // --- Pass 1: Build a map of Template -> [Categories] ---
    info!("Pass 1: Building template-to-category map...");
    let template_map = build_template_category_map(&xml_path)?;
    info!(
        "Pass 1 Complete: Found {} templates with categories.",
        template_map.len()
    );

    // --- Pass 2: Process pages and convert to Markdown ---
    info!("Pass 2: Processing and converting articles...");
    let mut reader = Reader::from_file(&xml_path)?;

    let mut buf = Vec::new();
    let mut current_page = PageData::default();
    let mut in_title = false;
    let mut in_text = false;
    let mut in_ns = false;
    let mut wiki_domain: Option<String> = None;
    let mut created_files = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"base" => {
                    if wiki_domain.is_none() {
                        let mut text_buf = Vec::new();
                        if let Ok(Event::Text(e_text)) = reader.read_event_into(&mut text_buf) {
                            let base_text = e_text.decode()?;
                            if let Some(domain) = extract_wiki_domain(&base_text) {
                                info!("Extracted wiki domain: {}", domain);
                                wiki_domain = Some(domain);
                            }
                        }
                    }
                }
                b"page" => current_page = PageData::default(),
                b"title" => in_title = true,
                b"text" => in_text = true,
                b"ns" => in_ns = true,
                b"redirect" => current_page.is_redirect = true,
                _ => (),
            },
            Ok(Event::Text(e)) => {
                let text = e.decode()?.to_string();
                if in_title {
                    current_page.title = text;
                } else if in_text {
                    current_page.text.push_str(&text);
                } else if in_ns {
                    current_page.ns = text;
                }
            }
            Ok(Event::End(e)) => match e.name().as_ref() {
                b"title" => in_title = false,
                b"text" => in_text = false,
                b"ns" => in_ns = false,
                b"page" => {
                    // Only process pages in the main namespace (ns=0), skip redirects and templates
                    if !current_page.is_redirect
                        && !current_page.title.is_empty()
                        && (current_page.ns == "0" || current_page.ns.is_empty())
                    {
                        let file_path = process_page(
                            current_page,
                            &output_dir,
                            wiki_domain.as_deref(),
                            &template_map,
                            &app_handle,
                        )
                        .await?;
                        created_files.push(file_path);
                    }
                    // Reset for the next page
                    current_page = PageData::default();
                }
                _ => (),
            },
            Ok(Event::Eof) => break,
            Err(e) => return Err(e.into()),
            _ => (),
        }
        buf.clear();
    }

    info!("MediaWiki import completed successfully.");
    Ok(created_files)
}

/// **PASS 1**: Scans the XML dump to find all templates (ns=10) and maps their
/// names to the categories defined within them.
fn build_template_category_map(xml_path: &Path) -> Result<HashMap<String, Vec<String>>> {
    let mut reader = Reader::from_file(xml_path)?;
    let mut buf = Vec::new();
    let mut map = HashMap::new();

    let mut current_title = String::new();
    let mut current_text = String::new();
    let mut current_ns = String::new();
    let mut in_title = false;
    let mut in_text = false;
    let mut in_ns = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"page" => {
                    current_title.clear();
                    current_text.clear();
                    current_ns.clear();
                }
                b"title" => in_title = true,
                b"text" => in_text = true,
                b"ns" => in_ns = true,
                _ => (),
            },
            Ok(Event::Text(e)) => {
                let text = e.decode()?;
                if in_title {
                    current_title.push_str(&text);
                } else if in_text {
                    current_text.push_str(&text);
                } else if in_ns {
                    current_ns.push_str(&text);
                }
            }
            Ok(Event::End(e)) => match e.name().as_ref() {
                b"title" => in_title = false,
                b"text" => in_text = false,
                b"ns" => in_ns = false,
                b"page" => {
                    // We only care about templates, which are in namespace 10
                    if current_ns == "10" {
                        if let Some(template_name) = current_title.strip_prefix("Template:") {
                            let categories: Vec<String> = CATEGORY_RE
                                .captures_iter(&current_text)
                                .map(|cap| cap[1].trim().to_string())
                                .collect();

                            if !categories.is_empty() {
                                map.insert(template_name.trim().to_string(), categories);
                            }
                        }
                    }
                }
                _ => (),
            },
            Ok(Event::Eof) => break,
            Err(e) => return Err(e.into()),
            _ => (),
        }
        buf.clear();
    }
    Ok(map)
}

/// Main processing pipeline for a single MediaWiki page.
async fn process_page(
    page: PageData,
    output_dir: &Path,
    wiki_domain: Option<&str>,
    template_map: &HashMap<String, Vec<String>>,
    app_handle: &AppHandle,
) -> Result<PathBuf> {
    debug!("Processing page: {}", page.title);
    let mut wikitext = page.text;
    let mut frontmatter: HashMap<String, Value> = HashMap::new();
    let mut tags = HashSet::new();

    // 1. Set the canonical title in the frontmatter.
    frontmatter.insert("title".to_string(), Value::String(page.title.clone()));

    // 2. Extract categories directly from the page's wikitext.
    extract_categories(&mut wikitext, &mut tags);

    // 3. Initialize a set to hold all unique image names for this page.
    let mut all_image_names: HashSet<String> = HashSet::new();

    // 4. Process the infobox: extract data into frontmatter, infer tags,
    //    and collect the primary image name.
    let infobox_image_name =
        process_infobox(&mut wikitext, &mut frontmatter, &mut tags, template_map);
    if let Some(name) = infobox_image_name {
        all_image_names.insert(name);
    }

    // 5. Extract all remaining image names from the main body of the wikitext.
    all_image_names.extend(extract_body_image_names(&wikitext));

    // 6. Download all unique images collected from the page.
    //    This is now the single point where network requests for images are made.
    download_page_images(&all_image_names, wiki_domain, output_dir, &page.title).await;

    // 7. Add all collected tags to the frontmatter.
    if !tags.is_empty() {
        frontmatter.insert(
            "tags".to_string(),
            Value::Sequence(
                tags.iter()
                    .map(|t| Value::String(t.clone()))
                    .collect::<Vec<_>>(),
            ),
        );
    }

    // 8. Convert MediaWiki image links to HTML `<img>` tags BEFORE Pandoc.
    //    This preserves layout information and allows our renderer to handle the final conversion.
    wikitext = convert_mediawiki_images_to_html(&wikitext);

    // 9. Use a regex to remove all leftover "br /" tags.
    let cleaned_wikitext = BR_TAG_RE.replace_all(&wikitext, "");

    // 10. Convert the remaining wikitext to Markdown using Pandoc.
    let mut markdown = convert_with_pandoc(&cleaned_wikitext, &page.title, app_handle)?;
    markdown = convert_links_to_wikilinks(markdown);

    // 11. Assemble the final file content and write it to disk.
    write_markdown_file(output_dir, &page.title, frontmatter, &markdown)
}

// --- Helper Functions for process_page ---

/// Extracts `[[Category:Foo]]` links, adds "Foo" to the tags set, and removes the link from the wikitext.
fn extract_categories(wikitext: &mut String, tags: &mut HashSet<String>) {
    let temp_wikitext = wikitext.clone();
    let result = CATEGORY_RE
        .replace_all(&temp_wikitext, |caps: &Captures| {
            let tag = normalize_tag(&caps[1]);
            tags.insert(tag);
            "" // Remove the category link from the text
        })
        .to_string();
    *wikitext = result;
}

/// Finds and processes an infobox, updating frontmatter and tags.
///
/// This synchronous function parses the infobox, moves its key-value data
/// into the frontmatter, and uses the `template_map` to infer tags.
/// It no longer performs any async operations (like downloading images).
///
/// # Returns
///
/// An `Option<String>` containing the name of the primary image found in the infobox, if any.
fn process_infobox(
    wikitext: &mut String,
    frontmatter: &mut HashMap<String, Value>,
    tags: &mut HashSet<String>,
    template_map: &HashMap<String, Vec<String>>,
) -> Option<String> {
    let mut image_name: Option<String> = None;
    if let Some(infobox_capture) = INFOBOX_RE.captures(wikitext) {
        let infobox_content = infobox_capture[1].to_string();
        let (infobox_name, mut infobox_data) = parse_infobox(&infobox_content);

        // --- Infobox Name and Tag Processing ---
        // Use the infobox name (e.g., "Infobox person") to create a frontmatter field
        // and look up its categories in the template map to generate tags.
        if let Some(name) = infobox_name {
            // Add a frontmatter key for the type of infobox.
            let clean_name = clean_infobox_name(&name);
            if !clean_name.is_empty() {
                frontmatter.insert("infobox".to_string(), Value::String(clean_name));
            }

            // Normalize the parsed name by replacing underscores with spaces
            // before looking it up in the map.
            let normalized_lookup_name = name.trim().replace('_', " ");
            if let Some(categories) = template_map.get(&normalized_lookup_name) {
                for category in categories {
                    tags.insert(normalize_tag(category));
                }
            }
        }

        // --- Primary Image Extraction ---
        // Find the first key that starts with "image" to use as the primary image.
        let image_entry = infobox_data
            .iter()
            .find(|(k, _)| k.starts_with("image"))
            .map(|(k, v)| (k.clone(), v.clone()));

        if let Some((original_key, found_image_name)) = image_entry {
            // Set the image name to be returned by this function for later download.
            image_name = Some(found_image_name.trim().to_string());

            // If the key was "image1", "image_main", etc., standardize it to "image".
            if original_key != "image" {
                if let Some(value) = infobox_data.remove(&original_key) {
                    infobox_data.insert("image".to_string(), value);
                }
            }
        }

        // --- Frontmatter Population ---
        for (key, value) in infobox_data {
            if key != "title" {
                // The image key is now guaranteed to be "image" if one was found.
                let final_value = if key == "image" {
                    value.replace(' ', "_") // Match the saved filename format.
                } else {
                    // Otherwise, use the original value.
                    value
                };
                frontmatter.insert(key, Value::String(final_value));
            }
        }

        // Remove the processed infobox from the wikitext.
        *wikitext = INFOBOX_RE.replace(wikitext, "").to_string();
    }
    image_name
}

/// Normalizes and cleans an infobox template name into a simple, lowercase type.
///
/// This utility function takes a raw template name (e.g., "Infobox_character")
/// and applies a series of transformations to produce a clean type string (e.g., "character").
fn clean_infobox_name(name: &str) -> String {
    name.trim()
        .replace('_', " ")
        .to_lowercase()
        .strip_prefix("infobox")
        .and_then(|s| s.strip_prefix(' ').or(Some(s)))
        .unwrap_or(name)
        .trim()
        .to_string()
}

/// Scans wikitext for `[[File:...]]` or `[[Image:...]]` links and returns a set of the image names.
///
/// This function is synchronous and only responsible for parsing, not downloading.
fn extract_body_image_names(wikitext: &str) -> HashSet<String> {
    WIKITEXT_IMAGE_RE
        .captures_iter(wikitext)
        .filter_map(|cap| cap.get(1).map(|m| m.as_str().trim().to_string()))
        .collect()
}

/// Downloads a set of images for a given page, logging any errors.
///
/// This is the single entry point for downloading images. It iterates through the
/// provided set of unique image names and attempts to download each one.
async fn download_page_images(
    image_names: &HashSet<String>,
    wiki_domain: Option<&str>,
    output_dir: &Path,
    page_title: &str,
) {
    let Some(domain) = wiki_domain else { return };

    for image_name in image_names {
        if let Err(e) = download_image(image_name, domain, output_dir).await {
            warn!(
                "Failed to download image '{}' for page '{}': {}",
                image_name, page_title, e
            );
        }
    }
}

/// Assembles the YAML frontmatter and Markdown body and writes them to a file.
fn write_markdown_file(
    output_dir: &Path,
    title: &str,
    frontmatter: HashMap<String, Value>,
    markdown_body: &str,
) -> Result<PathBuf> {
    let yaml_header = serde_yaml::to_string(&frontmatter)?;
    let final_content = format!("---\n{}---\n\n{}", yaml_header, markdown_body.trim());
    let filename = format!("{}.md", clean_filename(title));
    let filepath = output_dir.join(filename);
    atomic_write(&filepath, &final_content)?;
    Ok(filepath)
}

// --- General Purpose Utility Functions ---

/// Converts MediaWiki image syntax like `[[File:Foo.jpg|thumb|left|250px|Caption]]`
/// into a styled HTML `<figure>` and `<img>` block.
///
/// This function parses the various parameters in the wikitext to extract alignment,
/// size constraints, and a caption. It then generates an HTML block that preserves
/// this layout information using inline CSS styles. This HTML is passed through
/// Pandoc and is later processed by the renderer, which converts the `src` path
/// to a Base64 data URL.
fn convert_mediawiki_images_to_html(wikitext: &str) -> String {
    WIKITEXT_IMAGE_RE
        .replace_all(wikitext, |caps: &Captures| {
            let filename = caps.get(1).map_or("", |m| m.as_str()).trim();
            let params_str = caps.get(2).map_or("", |m| m.as_str());

            // The image src needs to match the saved file format (spaces replaced with underscores).
            let image_src = filename.replace(' ', "_");

            // Define keywords that are not captions.
            let keywords = ["thumb", "frameless", "left", "right", "center"];

            // Split parameters, trimming whitespace from each.
            let params: Vec<&str> = params_str.split('|').skip(1).map(|p| p.trim()).collect();

            // The caption is the last parameter that isn't a size or a keyword.
            let caption = params
                .iter()
                .rfind(|p| !p.ends_with("px") && !keywords.contains(p))
                .map_or("", |s| *s)
                .to_string();

            let mut styles = HashMap::new();
            // Default alignment to 'right' to match common wiki layouts.
            // This will only be overridden if 'left' or 'center' is explicitly found.
            let mut align = "right";

            // Find the first parameter that specifies a width. This handles "320px" and "320x320px".
            let max_width = params.iter().find_map(|p| {
                p.strip_suffix("px")
                    .and_then(|dimensions| dimensions.split('x').next())
                    .and_then(|width_str| width_str.trim().parse::<u32>().ok())
            });

            if let Some(w) = max_width {
                styles.insert("max-width".to_string(), format!("{}px", w));
            }

            // Determine alignment from the remaining parameters.
            for param in &params {
                if *param == "left" {
                    align = "left";
                } else if *param == "center" {
                    align = "center";
                }
            }

            // Apply styles based on the final alignment.
            match align {
                "left" => {
                    styles.insert("float".to_string(), "left".to_string());
                    styles.insert("margin".to_string(), "0.5em 1em 0.5em 0".to_string());
                }
                "right" => {
                    styles.insert("float".to_string(), "right".to_string());
                    styles.insert("margin".to_string(), "0.5em 0 0.5em 1em".to_string());
                }
                "center" => {
                    // For center, we don't float. We'll use a wrapper div.
                    styles.insert("margin".to_string(), "0.5em auto".to_string());
                }
                _ => {} // Should not happen.
            }

            let style_attr = styles
                .iter()
                .map(|(k, v)| format!("{}: {};", k, v))
                .collect::<String>();

            // The alt attribute uses the caption for accessibility.
            let alt_attr = html_escape::encode_double_quoted_attribute(&caption);

            // Construct the self-contained <img> tag.
            let img_tag = format!(
                r#"<img src="{}" alt="{}" style="display: block; max-width: 100%; height: auto;">"#,
                image_src, alt_attr
            );

            // Build the final HTML, using <figure> and <figcaption> if a caption exists.
            let figure_content = if caption.is_empty() {
                img_tag
            } else {
                format!("{}<figcaption>{}</figcaption>", img_tag, caption)
            };
            if align == "center" {
                // The outer div handles centering the figure.
                format!(
                    r#"<div style="display: flex; justify-content: center;"><figure style="{}">{}</figure></div>"#,
                    style_attr, figure_content
                )
            } else {
                format!(r#"<figure style="{}">{}</figure>"#, style_attr, figure_content)
            }
        })
        .to_string()
}

/// Downloads a single image from the MediaWiki API.
#[instrument(skip(output_dir), err)]
async fn download_image(image_name: &str, domain: &str, output_dir: &Path) -> Result<()> {
    // First, remove invalid characters.
    let base_name = clean_filename(image_name);
    // THEN, replace spaces with underscores for the final filename.
    let final_name = base_name.replace(' ', "_");

    let image_dir = output_dir.join(IMAGES_DIR_NAME);
    fs::create_dir_all(&image_dir)?;
    let final_path = image_dir.join(&final_name);

    if final_path.exists() {
        debug!("Skipping download, image already exists: {}", final_name);
        return Ok(());
    }

    let url = format!(
        "https://{}/api.php?action=query&format=json&prop=imageinfo&titles=File:{}&iiprop=url",
        domain, image_name
    );

    let resp = reqwest::get(&url).await?;
    if !resp.status().is_success() {
        warn!(
            "Failed to get image info for '{}', status: {}",
            image_name,
            resp.status()
        );
        return Ok(()); // Soft failure
    }

    let api_resp: ApiResponse = resp.json().await?;

    let Some(image_url) = api_resp
        .query
        .pages
        .values()
        .next()
        .and_then(|p| p.imageinfo.as_ref())
        .and_then(|ii| ii.first())
        .map(|i| &i.url)
    else {
        warn!("Could not find URL for image: {}", image_name);
        return Ok(()); // Soft failure
    };

    debug!("Downloading image from {}", image_url);
    let image_bytes = reqwest::get(image_url).await?.bytes().await?;
    fs::write(final_path, image_bytes)?;
    info!("Successfully downloaded {}", final_name);

    Ok(())
}

/// An infobox parser that correctly handles nested brackets.
fn parse_infobox(content: &str) -> (Option<String>, HashMap<String, String>) {
    let mut data = HashMap::new();
    let mut nested_level = 0; // Handles nested templates/links
    let mut last_split = 0;
    let mut params = Vec::new();

    // Manually split the content by '|' but ignore pipes inside [[...]] or {{...}}
    for (i, char) in content.char_indices() {
        match char {
            '[' | '{' => nested_level += 1,
            ']' | '}' => {
                if nested_level > 0 {
                    nested_level -= 1
                }
            }
            '|' if nested_level == 0 => {
                params.push(&content[last_split..i]);
                last_split = i + 1;
            }
            _ => {}
        }
    }
    params.push(&content[last_split..]);

    // The first parameter is the infobox name/type.
    let infobox_name = params.first().map(|s| s.trim().to_string());

    // Process the rest of the parameters (key=value pairs).
    for param in params.iter().skip(1) {
        if let Some((key, value)) = param.split_once('=') {
            let key = key.trim().to_lowercase();
            let value = value.trim().to_string();
            if !key.is_empty() {
                data.insert(key, value);
            }
        }
    }
    (infobox_name, data)
}

/// Calls Pandoc to convert MediaWiki text to Markdown.
fn convert_with_pandoc(text: &str, title: &str, app_handle: &AppHandle) -> Result<String> {
    let pandoc_exe = get_pandoc_executable_path(app_handle)?;

    let mut process = Command::new(pandoc_exe)
        .arg("--from=mediawiki")
        .arg("--to=gfm")
        .arg("--wrap=none")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    // Use a separate thread to write to stdin to avoid deadlocks with large inputs
    let text_clone = text.to_string();
    let mut stdin = process.stdin.take().ok_or_else(|| {
        ChroniclerError::PandocConversionFailed("Could not get stdin".to_string())
    })?;
    std::thread::spawn(move || {
        stdin.write_all(text_clone.as_bytes()).ok();
    });

    let output: Output = process.wait_with_output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!("Pandoc failed for '{}'. Stderr: {}", title, stderr.trim());
        return Ok(text.to_string()); // Fallback to raw text
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Converts Pandoc's link format `[Text](Target "wikilink")` to `[[Target|Text]]`.
fn convert_links_to_wikilinks(md: String) -> String {
    PANDOC_LINK_RE
        .replace_all(&md, |caps: &Captures| {
            let text = caps.get(1).map_or("", |m| m.as_str()).trim();
            let target = caps.get(2).map_or("", |m| m.as_str()).trim();

            if target.starts_with("http://") || target.starts_with("https://") {
                return caps.get(0).unwrap().as_str().to_string();
            }

            let clean_target = target.replace('_', " ");

            // If the link text and cleaned target are the same, create a simple wikilink
            if text == clean_target {
                format!("[[{}]]", clean_target)
            } else {
                // Otherwise, create an aliased wikilink
                format!("[[{}|{}]]", clean_target, text)
            }
        })
        .to_string()
}

/// Extracts the domain from the <base> tag URL.
fn extract_wiki_domain(base_url: &str) -> Option<String> {
    Regex::new(r"https?://([^/]+)")
        .ok()?
        .captures(base_url)?
        .get(1)
        .map(|m| m.as_str().to_string())
}

/// Cleans a title to be a valid filesystem path component.
fn clean_filename(title: &str) -> String {
    INVALID_FILENAME_CHARS.replace_all(title, "_").to_string()
}

/// Normalizes a tag string.
fn normalize_tag(tag: &str) -> String {
    tag.trim().to_string()
}
