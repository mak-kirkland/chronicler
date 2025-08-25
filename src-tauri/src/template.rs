//! Manages user-defined page templates.
//!
//! This module handles all file system operations related to templates,
//! which are stored in a special `templates` directory within the
//! global application configuration directory, making them available across all vaults.

use crate::{
    error::{ChroniclerError, Result},
    models::PageHeader,
    utils::file_stem_string,
    writer::atomic_write,
};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};
use tracing::instrument;

/// The name of the directory inside the app's config folder where templates are stored.
const TEMPLATE_DIR: &str = "templates";

/// Retrieves the absolute path to the templates directory, creating it if it doesn't exist.
///
/// # Arguments
/// * `app_handle` - The Tauri application handle, used to get the app's config path.
fn get_templates_dir(app_handle: &AppHandle) -> Result<PathBuf> {
    let config_dir = app_handle.path().app_config_dir()?;
    let dir = config_dir.join(TEMPLATE_DIR);
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

/// Retrieves a list of all available templates.
///
/// Scans the template directory and returns a `PageHeader` for each `.md` file found.
#[instrument(skip(app_handle))]
pub fn list_templates(app_handle: &AppHandle) -> Result<Vec<PageHeader>> {
    let templates_dir = get_templates_dir(app_handle)?;
    let mut templates = Vec::new();

    for entry in fs::read_dir(templates_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
            templates.push(PageHeader {
                title: file_stem_string(&path),
                path,
            });
        }
    }
    // Sort templates alphabetically by title for consistent display.
    templates.sort_by(|a, b| a.title.cmp(&b.title));
    Ok(templates)
}

/// Reads the raw content of a specific template file.
#[instrument]
pub fn read_template(path: &Path) -> Result<String> {
    fs::read_to_string(path).map_err(Into::into)
}

/// Saves content to a template file. If the file doesn't exist, it will be created.
///
/// # Arguments
/// * `app_handle` - The Tauri application handle.
/// * `name` - The name of the template (without extension).
/// * `content` - The new content to save to the template.
#[instrument(skip(app_handle, content))]
pub fn write_template(app_handle: &AppHandle, name: &str, content: &str) -> Result<PathBuf> {
    let templates_dir = get_templates_dir(app_handle)?;
    let path = templates_dir.join(format!("{}.md", name));
    atomic_write(&path, content)?;
    Ok(path)
}

/// Deletes a template file.
#[instrument]
pub fn delete_template(path: &Path) -> Result<()> {
    if path.exists() {
        fs::remove_file(path).map_err(Into::into)
    } else {
        Err(ChroniclerError::FileNotFound(path.to_path_buf()))
    }
}
