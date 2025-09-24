//! Tauri command handlers for the worldbuilding application.
//!
//! These commands bridge the frontend (Svelte/JavaScript) and backend (Rust) functionality.
//! All commands are async-capable and automatically manage thread safety via Tauri's State system.

use crate::licensing;
use crate::licensing::License;
use crate::models::{BrokenLink, FullPageData, PageHeader, ParseError};
use crate::{
    config,
    error::Result,
    fonts, importer,
    models::{FileNode, RenderedPage},
    template,
    world::World,
};
use chrono::{Local, NaiveDate};
use std::path::PathBuf;
use tauri::{command, AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tracing::instrument;

// --- Vault and Initialization ---

/// Retrieves the stored vault path from the configuration file.
#[command]
#[instrument(skip(app_handle))]
pub fn get_vault_path(app_handle: AppHandle) -> Result<Option<String>> {
    config::get_vault_path(&app_handle)
}

/// Sets the vault path, saves it to config, and initializes the world state.
/// This uses fine-grained locking internally instead of a single write lock on the world.
#[command]
#[instrument(skip(world, app_handle))]
pub fn initialize_vault(path: String, world: State<World>, app_handle: AppHandle) -> Result<()> {
    world.change_vault(path, app_handle)
}

// --- Data Retrieval ---

/// Returns the tag index, mapping tags to lists of pages that contain them.
#[command]
#[instrument(skip(world))]
pub fn get_all_tags(world: State<World>) -> Result<Vec<(String, Vec<PageHeader>)>> {
    world.get_all_tags()
}

/// Returns the hierarchical file tree structure of the vault.
#[command]
#[instrument(skip(world))]
pub fn get_file_tree(world: State<World>) -> Result<FileNode> {
    world.get_file_tree()
}

/// Returns a list of all directory paths in the vault.
#[command]
#[instrument(skip(world))]
pub fn get_all_directory_paths(world: State<World>) -> Result<Vec<PathBuf>> {
    world.get_all_directory_paths()
}

/// Returns a list of all broken links in the vault.
#[command]
#[instrument(skip(world))]
pub fn get_all_broken_links(world: State<World>) -> Result<Vec<BrokenLink>> {
    world.get_all_broken_links()
}

/// Returns a list of all pages with YAML parsing errors.
#[command]
#[instrument(skip(world))]
pub fn get_all_parse_errors(world: State<World>) -> Result<Vec<ParseError>> {
    world.get_all_parse_errors()
}

// --- Page Rendering and Content ---

/// Processes raw markdown content, renders it to HTML with wikilinks resolved,
/// and returns a structured object for the frontend preview.
#[command]
#[instrument(skip(content, world))]
pub fn render_page_preview(content: String, world: State<World>) -> Result<RenderedPage> {
    world.render_page_preview(&content)
}

/// Parses the file on disk, renders the markdown to HTML, and returns a composed
/// object containing the raw content, and the rendered preview.
#[command]
#[instrument(skip(world))]
pub fn build_page_view(path: String, world: State<World>) -> Result<FullPageData> {
    world.build_page_view(&path)
}

/// Renders a string of pure Markdown to a `RenderedPage` object containing only HTML.
/// This command does not process wikilinks or frontmatter.
#[command]
#[instrument(skip(content, world))]
pub fn render_markdown(content: String, world: State<World>) -> Result<RenderedPage> {
    world.render_markdown(&content)
}

/// Converts a relative or absolute image path to a Base64 Data URL string.
#[command]
#[instrument(skip(world))]
pub fn get_image_as_base64(path: String, world: State<World>) -> Result<String> {
    world.get_image_as_base64(&path)
}

// --- File and Folder Operations ---

/// Writes content to a page on disk. The file watcher will pick up the change.
#[command]
#[instrument(skip(world, content))]
pub fn write_page_content(world: State<World>, path: String, content: String) -> Result<()> {
    world.write_page_content(&path, &content)
}

/// Creates a new, empty markdown file and synchronously updates the index.
#[command]
#[instrument(skip(world))]
pub fn create_new_file(
    world: State<World>,
    parent_dir: String,
    file_name: String,
    template_path: Option<String>,
) -> Result<PageHeader> {
    world.create_new_file(parent_dir, file_name, template_path)
}

/// Creates a new, empty folder.
#[command]
#[instrument(skip(world))]
pub fn create_new_folder(
    world: State<World>,
    parent_dir: String,
    folder_name: String,
) -> Result<()> {
    world.create_new_folder(parent_dir, folder_name)
}

/// Renames a file or folder on disk, updates backlinks, and returns the new path.
#[command]
#[instrument(skip(world))]
pub fn rename_path(world: State<World>, path: String, new_name: String) -> Result<PathBuf> {
    world.rename_path(PathBuf::from(path), new_name)
}

/// Deletes a file or folder from disk and updates the index.
#[command]
#[instrument(skip(world))]
pub fn delete_path(world: State<World>, path: String) -> Result<()> {
    world.delete_path(PathBuf::from(path))
}

/// Moves a file or folder to a new directory, updates backlinks, and returns the new path.
#[command]
#[instrument(skip(world))]
pub fn move_path(world: State<World>, source_path: String, dest_dir: String) -> Result<PathBuf> {
    world.move_path(PathBuf::from(source_path), PathBuf::from(dest_dir))
}

/// Duplicates a page, creating a new file with a numerical suffix.
#[command]
#[instrument(skip(world))]
pub fn duplicate_page(path: String, world: State<World>) -> Result<PageHeader> {
    world.duplicate_page(path)
}

/// Opens the specified path in the OS's default file explorer.
#[command]
#[instrument(skip(app_handle))]
pub fn open_in_explorer(app_handle: AppHandle, path: String) -> Result<()> {
    app_handle.opener().open_path(path, None::<&str>)?;
    Ok(())
}

// --- Importer ---

/// Imports a list of .docx files, converting them to Markdown.
#[command]
#[instrument(skip(world, app_handle))]
pub fn import_docx_files(
    world: State<World>,
    app_handle: AppHandle,
    docx_paths: Vec<PathBuf>,
) -> Result<Vec<PathBuf>> {
    world.import_docx_files(&app_handle, docx_paths)
}

/// Scans a directory for .docx files and imports them.
#[command]
#[instrument(skip(world, app_handle))]
pub fn import_docx_from_folder(
    world: State<World>,
    app_handle: AppHandle,
    folder_path: PathBuf,
) -> Result<Vec<PathBuf>> {
    world.import_docx_from_folder(&app_handle, folder_path)
}

/// Imports a MediaWiki XML dump file.
#[command]
#[instrument(skip(world, app_handle))]
pub async fn import_mediawiki_dump(
    world: State<'_, World>,
    app_handle: AppHandle,
    xml_path: PathBuf,
) -> Result<Vec<PathBuf>> {
    world.import_mediawiki_dump(app_handle, xml_path).await
}

/// Checks if Pandoc is installed in the application's config directory.
#[command]
#[instrument(skip(app_handle))]
pub fn is_pandoc_installed(app_handle: AppHandle) -> Result<bool> {
    importer::is_pandoc_installed(&app_handle)
}

/// Downloads and extracts Pandoc to the application's config directory.
#[command]
#[instrument(skip(app_handle))]
pub async fn download_pandoc(app_handle: AppHandle) -> Result<()> {
    importer::download_pandoc(app_handle).await
}

// --- Licensing ---

/// Retrieves the current license status from the stored license file.
#[command]
#[instrument(skip(app_handle))]
pub fn get_license_status(app_handle: AppHandle) -> Result<Option<License>> {
    licensing::load_license(&app_handle)
}

/// Verifies a license key, and if valid, saves it to the config directory.
#[command]
#[instrument(skip(app_handle, license_key))]
pub async fn verify_and_store_license(
    app_handle: AppHandle,
    license_key: String,
) -> Result<License> {
    let license = licensing::validate_license(&license_key).await?;
    licensing::save_license(&app_handle, &license)?;
    Ok(license)
}

// --- System ---

/// Checks for the "APPIMAGE" environment variable to determine if the
/// application is running as an AppImage on Linux.
#[command]
#[instrument]
pub fn get_linux_install_type() -> String {
    // The APPIMAGE env var is set by the AppImage runtime.
    if std::env::var("APPIMAGE").is_ok() {
        "appimage".to_string()
    } else {
        // This indicates it's likely a .deb, .rpm, or other system-managed package.
        "other".to_string()
    }
}

/// Checks the number of days the application has been in use.
/// If it's the first time this check is run, it records the current date.
#[command]
#[instrument(skip(app_handle))]
pub fn get_app_usage_days(app_handle: AppHandle) -> Result<i64> {
    let mut config = config::load(&app_handle)?;

    match config.first_launch_date {
        Some(date_str) => {
            // If a date is already stored, calculate the difference.
            let first_launch_date = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
                .unwrap_or_else(|_| Local::now().date_naive());
            let current_date = Local::now().date_naive();
            let duration = current_date.signed_duration_since(first_launch_date);
            Ok(duration.num_days())
        }
        None => {
            // If no date is stored, this is the first launch.
            // Record today's date and return 0 days.
            let today = Local::now().date_naive().format("%Y-%m-%d").to_string();
            config.first_launch_date = Some(today);
            config::save(&app_handle, &config)?;
            Ok(0)
        }
    }
}

/// Opens the application's log directory in the default file explorer.
#[command]
#[instrument(skip(app_handle))]
pub fn open_log_directory(app_handle: AppHandle) -> Result<()> {
    let log_dir = app_handle.path().app_log_dir()?;
    app_handle
        .opener()
        .open_path(log_dir.to_string_lossy(), None::<&str>)?;
    Ok(())
}

// --- Template Commands ---

/// Retrieves a list of all available templates.
#[command]
#[instrument(skip(app_handle))]
pub fn list_templates(app_handle: AppHandle) -> Result<Vec<PageHeader>> {
    template::list_templates(&app_handle)
}

/// Reads the raw content of a specific template file.
#[command]
#[instrument]
pub fn read_template(path: String) -> Result<String> {
    template::read_template(&PathBuf::from(path))
}

/// Saves content to a template file.
#[command]
#[instrument(skip(app_handle, content))]
pub fn write_template(app_handle: AppHandle, name: String, content: String) -> Result<PathBuf> {
    template::write_template(&app_handle, &name, &content)
}

/// Deletes a template file.
#[command]
#[instrument]
pub fn delete_template(path: String) -> Result<()> {
    template::delete_template(&PathBuf::from(path))
}

// --- Custom Fonts ---

/// Scans the application's config directory for user-provided font files.
#[command]
#[instrument(skip(app_handle))]
pub fn get_user_fonts(app_handle: AppHandle) -> Result<Vec<fonts::UserFont>> {
    fonts::get_user_fonts(&app_handle)
}
