//! Shared utility functions.
//!
//! Common helpers used across modules.

use std::path::Path;

/// Helper function to check if a path points to a Markdown file.
pub fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
}
