//! Shared utility functions.
//!
//! Common helpers used across modules.

use std::path::Path;

/// A list of common image file extensions.
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg"];

/// Helper function to check if a path points to a Markdown file.
pub fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
}

/// Helper function to check if a path points to a map file.
pub fn is_map_file(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("cmap"))
}

/// Checks if a path points to a supported image file.
pub fn is_image_file(path: &Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .map(|ext| IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Extracts the file stem from a path and returns it as a clean String.
/// Returns an empty string if the path has no file stem.
pub fn file_stem_string(path: &Path) -> String {
    path.file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}
