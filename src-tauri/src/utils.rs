//! Shared utility functions.
//!
//! Common helpers used across modules.

use std::path::Path;

/// Helper function to check if a path points to a Markdown file.
pub fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
}

/// Extracts the file stem from a path and returns it as a clean String.
/// Returns an empty string if the path has no file stem.
pub fn path_to_stem_string(path: &Path) -> String {
    path.file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}
