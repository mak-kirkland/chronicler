//! Tauri command handlers for the worldbuilding application.
//!
//! These commands bridge the frontend (Svelte/JavaScript) and backend (Rust) functionality.
//! All commands are async-capable and automatically manage thread safety via Tauri's State system.

use crate::licensing;
use crate::licensing::License;
use crate::models::{BrokenImage, BrokenLink, FullPageData, PageHeader, ParseError};
use crate::{
    config,
    error::Result,
    fonts, importer,
    models::{FileNode, RenderedPage},
    themes,
    world::World,
};
use chrono::{Local, NaiveDate};
use std::path::PathBuf;
use tauri::{command, AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tracing::instrument;

// --- Vault and Initialization ---

/// Returns the active vault path for this session, falling back to the
/// on-disk config when no vault is yet open.
///
/// Reading from the World's in-memory `root_path` keeps the running session
/// stable when a second instance rewrites the shared config (e.g. by
/// switching its own vault) — otherwise a later `world.initialize()` refresh
/// would surface the *other* instance's vault as ours and any UI that builds
/// paths from `$vaultPath` would target the wrong directory.
#[command]
#[instrument(skip(world, app_handle), err(Debug))]
pub fn get_vault_path(world: State<World>, app_handle: AppHandle) -> Result<Option<String>> {
    if let Some(p) = world.root_path.read().clone() {
        return Ok(Some(p.to_string_lossy().into_owned()));
    }
    config::get_vault_path(&app_handle)
}

/// Retrieves the list of recently opened vaults.
#[command]
#[instrument(skip(app_handle), err(Debug))]
pub fn get_recent_vaults(app_handle: AppHandle) -> Result<Vec<String>> {
    let config = config::load(&app_handle)?;
    Ok(config.recent_vaults)
}

/// Removes a vault from the recent vaults history.
#[command]
#[instrument(skip(app_handle), err(Debug))]
pub fn remove_recent_vault(path: String, app_handle: AppHandle) -> Result<()> {
    config::remove_recent_vault(path, &app_handle)
}

/// Sets the vault path, saves it to config, and initializes the world state.
/// This uses fine-grained locking internally instead of a single write lock on the world.
#[command]
#[instrument(skip(world, app_handle), err(Debug))]
pub fn initialize_vault(path: String, world: State<World>, app_handle: AppHandle) -> Result<()> {
    world.change_vault(path, app_handle)
}

// --- Data Retrieval ---

/// Returns the tag index, mapping tags to lists of pages that contain them.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn get_all_tags(world: State<World>) -> Result<Vec<(String, Vec<PageHeader>)>> {
    world.get_all_tags()
}

/// Returns the hierarchical file tree structure of the vault.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn get_file_tree(world: State<World>) -> Result<FileNode> {
    world.get_file_tree()
}

/// Returns a list of all directory paths in the vault.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn get_all_directory_paths(world: State<World>) -> Result<Vec<PathBuf>> {
    world.get_all_directory_paths()
}

/// Returns a list of all broken links in the vault.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn get_all_broken_links(world: State<World>) -> Result<Vec<BrokenLink>> {
    world.get_all_broken_links()
}

/// Returns a list of all broken image references in the vault.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn get_all_broken_images(world: State<World>) -> Result<Vec<BrokenImage>> {
    world.get_all_broken_images()
}

/// Returns a list of all pages with YAML parsing errors.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn get_all_parse_errors(world: State<World>) -> Result<Vec<ParseError>> {
    world.get_all_parse_errors()
}

// --- Page Rendering and Content ---

/// Processes raw markdown content, renders it to HTML with wikilinks resolved,
/// and returns a structured object for the frontend preview.
#[command]
#[instrument(skip(content, world), err(Debug))]
pub fn render_page_preview(content: String, world: State<World>) -> Result<RenderedPage> {
    world.render_page_preview(&content)
}

/// Parses the file on disk, renders the markdown to HTML, and returns a composed
/// object containing the raw content, and the rendered preview.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn build_page_view(path: String, world: State<World>) -> Result<FullPageData> {
    world.build_page_view(&path)
}

/// Renders a string of pure Markdown to a `RenderedPage` object containing only HTML.
/// This command does not process wikilinks or frontmatter.
#[command]
#[instrument(skip(content, world), err(Debug))]
pub fn render_markdown(content: String, world: State<World>) -> Result<RenderedPage> {
    world.render_markdown(&content)
}

/// Converts a relative or absolute image path to a Base64 Data URL string.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn get_image_as_base64(path: String, world: State<World>) -> Result<String> {
    world.get_image_as_base64(&path)
}

/// Returns the best source string (Asset URL or Base64) for a given image path.
/// Handles symlinks by checking if they are safe for the Asset Protocol.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn get_image_source(path: String, world: State<World>) -> Result<String> {
    world.get_image_source(&path)
}

/// Returns a source URL for a small cached thumbnail of the given image,
/// generating the thumbnail on first request. Falls back to the full-size
/// source if the image can't be decoded.
#[command]
#[instrument(skip(world), level = "debug", err(Debug))]
pub async fn get_image_thumbnail(path: String, world: State<'_, World>) -> Result<String> {
    world.get_image_thumbnail(&path).await
}

// --- File and Folder Operations ---

/// Writes content to a page on disk. The file watcher will pick up the change.
#[command]
#[instrument(skip(world, content), err(Debug))]
pub fn write_page_content(world: State<World>, path: String, content: String) -> Result<()> {
    world.write_page_content(&path, &content)
}

/// Creates a new, empty markdown file and synchronously updates the index.
#[command]
#[instrument(skip(world), err(Debug))]
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
#[instrument(skip(world), err(Debug))]
pub fn create_new_folder(
    world: State<World>,
    parent_dir: String,
    folder_name: String,
) -> Result<()> {
    world.create_new_folder(parent_dir, folder_name)
}

/// Renames a file or folder on disk, updates backlinks, and returns the new path.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn rename_path(world: State<World>, path: String, new_name: String) -> Result<PathBuf> {
    world.rename_path(PathBuf::from(path), new_name)
}

/// Deletes a file or folder from disk and updates the index.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn delete_path(world: State<World>, path: String) -> Result<()> {
    world.delete_path(PathBuf::from(path))
}

/// Moves a file or folder to a new directory, updates backlinks, and returns the new path.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn move_path(world: State<World>, source_path: String, dest_dir: String) -> Result<PathBuf> {
    world.move_path(PathBuf::from(source_path), PathBuf::from(dest_dir))
}

/// Duplicates a page, creating a new file with a numerical suffix.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn duplicate_page(path: String, world: State<World>) -> Result<PageHeader> {
    world.duplicate_page(path)
}

/// Opens the specified path in the OS's default file explorer.
#[command]
#[instrument(skip(app_handle), err(Debug))]
pub fn open_in_explorer(app_handle: AppHandle, path: String) -> Result<()> {
    app_handle.opener().open_path(path, None::<&str>)?;
    Ok(())
}

/// Reads a `.cmap` file from within the vault and returns its raw JSON.
/// Frontend parses once — see `Indexer::get_map_config` for the rationale.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn get_map_config(path: String, world: State<World>) -> Result<String> {
    world.get_map_config(&path)
}

/// Returns cached tile info for a map layer image, or `None` if no pyramid
/// is on disk. Pure read — never triggers generation. Frontend awaits this
/// before mounting a layer to avoid loading the original image when tiles
/// are already cached.
#[command]
#[instrument(skip(world), err(Debug))]
pub fn lookup_layer_tile_info(
    image_filename: String,
    world: State<'_, World>,
) -> Result<Option<crate::tiler::TileSetInfo>> {
    world.lookup_layer_tile_info(&image_filename)
}

/// Generates (or returns cached) tile pyramid data for a map layer image.
///
/// Called by the frontend before rendering a map layer. If tiles already exist
/// and are up-to-date, returns immediately. Otherwise generates the full tile
/// pyramid on a background thread, emitting `tile-progress` events so the
/// frontend can display a progress bar.
#[command]
#[instrument(skip(world, app_handle), err(Debug))]
pub async fn ensure_layer_tiles(
    image_filename: String,
    world: State<'_, World>,
    app_handle: AppHandle,
) -> Result<crate::tiler::TileSetInfo> {
    world.ensure_layer_tiles(&image_filename, app_handle).await
}

// --- Importer ---

/// Imports a list of .docx files, converting them to Markdown.
#[command]
#[instrument(skip(world, app_handle), err(Debug))]
pub fn import_docx_files(
    world: State<World>,
    app_handle: AppHandle,
    docx_paths: Vec<PathBuf>,
) -> Result<Vec<PathBuf>> {
    world.import_docx_files(&app_handle, docx_paths)
}

/// Scans a directory for .docx files and imports them.
#[command]
#[instrument(skip(world, app_handle), err(Debug))]
pub fn import_docx_from_folder(
    world: State<World>,
    app_handle: AppHandle,
    folder_path: PathBuf,
) -> Result<Vec<PathBuf>> {
    world.import_docx_from_folder(&app_handle, folder_path)
}

/// Imports a MediaWiki XML dump file.
#[command]
#[instrument(skip(world, app_handle), err(Debug))]
pub async fn import_mediawiki_dump(
    world: State<'_, World>,
    app_handle: AppHandle,
    xml_path: PathBuf,
) -> Result<Vec<PathBuf>> {
    world.import_mediawiki_dump(app_handle, xml_path).await
}

/// Checks if Pandoc is installed in the application's config directory.
#[command]
#[instrument(skip(app_handle), err(Debug))]
pub fn is_pandoc_installed(app_handle: AppHandle) -> Result<bool> {
    importer::is_pandoc_installed(&app_handle)
}

/// Downloads and extracts Pandoc to the application's config directory.
#[command]
#[instrument(skip(app_handle), err(Debug))]
pub async fn download_pandoc(app_handle: AppHandle) -> Result<()> {
    importer::download_pandoc(app_handle).await
}

// --- Licensing ---

/// Retrieves the current license status from the stored license file.
#[command]
#[instrument(skip(app_handle), err(Debug))]
pub fn get_license_status(app_handle: AppHandle) -> Result<Option<License>> {
    licensing::load_and_verify_license(&app_handle)
}

/// Verifies a license key, and if valid, saves it to the config directory.
#[command]
#[instrument(skip(app_handle, license_key), err(Debug))]
pub async fn verify_and_store_license(
    app_handle: AppHandle,
    license_key: String,
) -> Result<License> {
    let validated = licensing::validate_license(&license_key).await?;
    licensing::save_license(&app_handle, &validated)?;
    Ok(validated.license)
}

// --- System ---

/// Detects how the running binary was installed on Linux. Used by the
/// updater to decide whether the in-app installer is allowed (AppImage) or
/// whether the user has to update via their package manager / `flatpak update`.
///
/// Returns one of: "appimage", "flatpak", or "other" (.deb, .rpm, AUR, etc.).
#[command]
#[instrument]
pub fn get_linux_install_type() -> String {
    // /.flatpak-info is created inside every Flatpak sandbox and is the
    // canonical signal.
    if std::path::Path::new("/.flatpak-info").exists() {
        return "flatpak".to_string();
    }
    // The APPIMAGE env var is set by the AppImage runtime.
    if std::env::var("APPIMAGE").is_ok() {
        return "appimage".to_string();
    }
    // .deb, .rpm, AUR, or anything else system-managed.
    "other".to_string()
}

/// Checks the number of days the application has been in use.
/// If it's the first time this check is run, it records the current date.
#[command]
#[instrument(skip(app_handle), err(Debug))]
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

/// Records a log line emitted by the frontend into the same rolling log file
/// the backend writes to, so user bug reports contain a single unified log.
///
/// `level` is matched against `tracing` levels; unknown values fall through as
/// `info` with the original level preserved in the message. The
/// `chronicler::frontend` target nests under the existing crate-level
/// `EnvFilter` (so `chronicler=info` already includes these) while still
/// being trivially greppable.
#[command]
pub fn log_from_frontend(level: String, message: String, context: Option<String>) {
    let ctx = context.as_deref().unwrap_or("-");
    match level.as_str() {
        "error" => tracing::error!(target: "chronicler::frontend", "[{ctx}] {message}"),
        "warn" => tracing::warn!(target: "chronicler::frontend", "[{ctx}] {message}"),
        "info" => tracing::info!(target: "chronicler::frontend", "[{ctx}] {message}"),
        "debug" => tracing::debug!(target: "chronicler::frontend", "[{ctx}] {message}"),
        _ => tracing::info!(target: "chronicler::frontend", "[{ctx}] [{level}] {message}"),
    }
}

/// Opens the application's log directory in the default file explorer.
#[command]
#[instrument(skip(app_handle), err(Debug))]
pub fn open_log_directory(app_handle: AppHandle) -> Result<()> {
    let log_dir = app_handle.path().app_log_dir()?;
    app_handle
        .opener()
        .open_path(log_dir.to_string_lossy(), None::<&str>)?;
    Ok(())
}

// --- Custom Fonts ---

/// Scans the application's config directory for user-provided font files.
#[command]
#[instrument(skip(app_handle), err(Debug))]
pub fn get_user_fonts(app_handle: AppHandle) -> Result<Vec<fonts::UserFont>> {
    fonts::get_user_fonts(&app_handle)
}

/// Copies a user-picked font file into the app's managed fonts directory.
#[command]
#[instrument(skip(app_handle), err(Debug))]
pub fn install_user_font(app_handle: AppHandle, source: String) -> Result<fonts::UserFont> {
    fonts::install_user_font(&app_handle, std::path::Path::new(&source))
}

// --- Telemetry / Privacy ---

/// Returns the user's telemetry choice. `None` means they haven't been asked
/// yet - the frontend uses this to decide whether to show the consent modal.
#[command]
#[instrument(skip(app_handle), err(Debug))]
pub fn get_telemetry_enabled(app_handle: AppHandle) -> Result<Option<bool>> {
    Ok(config::load(&app_handle)?.telemetry_enabled)
}

/// Persists the user's telemetry choice. Called from both the consent modal
/// and the Settings toggle.
#[command]
#[instrument(skip(app_handle), err(Debug))]
pub fn set_telemetry_enabled(enabled: bool, app_handle: AppHandle) -> Result<()> {
    config::set_telemetry_enabled(enabled, &app_handle)
}

// --- Themes ---

/// Returns every custom theme currently stored under `<app_config_dir>/themes/`.
/// Themes are returned as opaque JSON values — the frontend owns the shape.
#[command]
#[instrument(skip(app_handle), err(Debug))]
pub fn list_themes_on_disk(app_handle: AppHandle) -> Result<Vec<serde_json::Value>> {
    themes::list_themes(&app_handle)
}

/// Writes a theme JSON to disk.
///
/// With no `path`, the theme is saved into the app's managed themes
/// directory (this is the normal Save flow — slug computed from `name`,
/// overwriting any existing file with the same theme name).
///
/// With a `path`, the theme is written verbatim to that path. The path
/// originates from the OS save dialog on the frontend, so routing the
/// write through Rust avoids the scoped restrictions on
/// `@tauri-apps/plugin-fs` (the Export flow).
#[command]
#[instrument(skip(app_handle, theme), err(Debug))]
pub fn save_theme_to_disk(
    theme: serde_json::Value,
    path: Option<String>,
    app_handle: AppHandle,
) -> Result<()> {
    let target = path.as_deref().map(std::path::Path::new);
    themes::save_theme(&app_handle, theme, target)
}

/// Deletes the theme file whose `name` matches.
#[command]
#[instrument(skip(app_handle), err(Debug))]
pub fn delete_theme_from_disk(name: String, app_handle: AppHandle) -> Result<()> {
    themes::delete_theme(&app_handle, &name)
}

/// Reads a theme JSON from a user-supplied path (Import). Returns the raw
/// JSON for the frontend to validate against its `CustomTheme` shape.
#[command]
#[instrument(err(Debug))]
pub fn import_theme_from_path(path: String) -> Result<serde_json::Value> {
    themes::import_theme_from_path(std::path::Path::new(&path))
}
