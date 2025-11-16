//! Shared utility functions.
//!
//! Common helpers used across modules.

use serde::Serializer;
use std::path::Path;

/// A list of common image file extensions.
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg"];

/// A custom serialization function for `PathBuf` that guarantees forward slashes.
///
/// This function ensures that when a `PathBuf` is sent to the frontend, it's
/// always in a web-standard format with forward slashes (`/`), regardless of the
/// operating system. This creates a consistent and predictable API contract with
/// the TypeScript frontend.
pub fn serialize_pathbuf_as_web_str<S>(path: &Path, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let path_str = path.to_string_lossy().to_string();
    #[cfg(windows)]
    let web_path = path_str.replace('\\', "/");
    #[cfg(not(windows))]
    let web_path = path_str;
    serializer.serialize_str(&web_path)
}

/// Helper function to check if a path points to a Markdown file.
pub fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
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
