//! Handles the discovery and loading of user-provided custom fonts.
//!
//! This module provides the functionality to scan a dedicated `fonts` directory
//! within the application's config folder, read valid font files (.woff2, .ttf, .otf),
//! and prepare them for use in the frontend.

use crate::error::Result;
use crate::utils::serialize_pathbuf_as_web_str;
use font_kit::handle::Handle;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tracing::warn;

/// Represents a single user-provided font, prepared for frontend consumption.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserFont {
    /// The name of the font, derived from its filename (e.g., "FiraCode-Regular").
    pub name: String,
    /// The absolute path to the font file.
    #[serde(serialize_with = "serialize_pathbuf_as_web_str")]
    pub path: PathBuf,
}

/// Scans the app's config/fonts directory for valid font files and returns them.
///
/// This function is called by a Tauri command. It ensures the `fonts` directory
/// exists, iterates through its contents, and loads any supported font files it finds.
pub fn get_user_fonts(app_handle: &AppHandle) -> Result<Vec<UserFont>> {
    // 1. Determine the path to the `fonts` directory inside the app's config folder.
    let config_dir = app_handle.path().app_config_dir()?;
    let fonts_dir = config_dir.join("fonts");

    // 2. Ensure the fonts directory exists, creating it if it's the first time.
    if !fonts_dir.exists() {
        fs::create_dir_all(&fonts_dir)?;
    }

    let mut user_fonts = Vec::new();
    let valid_extensions = ["woff2", "ttf", "otf"];

    // 3. Read the directory entries.
    for entry in fs::read_dir(fonts_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            // 4. Check if the file has a supported extension.
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                if valid_extensions.contains(&ext.to_lowercase().as_str()) {
                    // 5. Load and process the font file.
                    if let Some(font) = load_font(&path) {
                        user_fonts.push(font);
                    } else {
                        warn!("Failed to load user font at path: {:?}", path);
                    }
                }
            }
        }
    }

    Ok(user_fonts)
}

/// Loads a single font file from a given path.
///
/// It reads the file's binary content and extracts a name from the metadata.
fn load_font(path: &Path) -> Option<UserFont> {
    // Load the font from its path. font-kit handles all the complex parsing.
    let font = Handle::from_path(path.to_path_buf(), 0).load().ok()?;
    // Get the family name. The library finds the best name automatically.
    let name = font.family_name();
    Some(UserFont {
        name,
        path: path.to_path_buf(),
    })
}
