//! Shared utility functions.
//!
//! Common helpers used across modules.

use serde::Serializer;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

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

/// Checks if a path points to a map configuration file (.cmap).
pub fn is_map_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|s| s.to_str())
        .is_some_and(|name| name.ends_with(".cmap"))
}

/// Extracts the file stem from a path and returns it as a clean String.
/// Returns an empty string if the path has no file stem.
pub fn file_stem_string(path: &Path) -> String {
    path.file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}

/// Checks if a path is hidden (starts with '.').
pub fn is_hidden_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|s| s.starts_with('.'))
}

/// Build a stable, human-readable cache key for a source file.
///
/// Format: `{sanitized_stem}-{len}-{mtime_nanos}`
///
/// Used as a filename stem (thumbnails: `{key}.jpg`) or directory name
/// (tile pyramids: `{key}/`). We use `file_stem` rather than `file_name`
/// so callers that append their own extension don't end up with awkward
/// `photo.jpg-...-.jpg` names. Stem collisions across source extensions
/// (e.g. `cover.jpg` + `cover.png` with the same len and mtime) are
/// theoretically possible but vanishingly rare.
///
/// Any edit to the source file changes `len` or `mtime` (or both), which
/// naturally invalidates the cache. Stable across Rust toolchain upgrades
/// (unlike `DefaultHasher`, whose output is explicitly non-portable).
pub fn compute_cache_key(path: &Path) -> String {
    let stem = path
        .file_stem()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_else(|| "unknown".to_string());

    let sanitized: String = stem
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();

    let (len, mtime_nanos) = fs::metadata(path)
        .ok()
        .map(|m| {
            let mtime = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            (m.len(), mtime)
        })
        .unwrap_or((0, 0));

    format!("{sanitized}-{len}-{mtime_nanos}")
}

/// Returns `true` if `path` lies under a hidden (`.`-prefixed) directory
/// inside `vault_root`.
pub fn is_under_hidden_subdir(path: &Path, vault_root: &Path) -> bool {
    path.strip_prefix(vault_root)
        .ok()
        .map(|rel| {
            rel.components()
                .any(|c| c.as_os_str().to_str().is_some_and(|s| s.starts_with('.')))
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_key_stable_for_same_path() {
        let p = Path::new("/some/test/image.png");
        assert_eq!(compute_cache_key(p), compute_cache_key(p));
    }

    #[test]
    fn cache_key_sanitizes_filename() {
        let p = Path::new("/some/test/My Photo (2).JPG");
        let key = compute_cache_key(p);
        // file_stem strips the final extension, so .JPG is gone before sanitization.
        assert!(key.starts_with("my_photo__2_-"));
    }

    #[test]
    fn cache_key_preserves_inner_extension_dots() {
        // Only the *final* extension is stripped by file_stem, so any earlier
        // dots in the name (e.g. "world.map.png" → stem "world.map") are
        // preserved by the dot-allowing sanitizer.
        let p = Path::new("/x/world.map.png");
        let key = compute_cache_key(p);
        assert!(key.starts_with("world.map-"));
    }

    #[test]
    fn under_hidden_subdir_catches_cache_writes() {
        let root = Path::new("/vault");
        assert!(is_under_hidden_subdir(
            Path::new("/vault/.chronicler-cache/thumbnails/foo.jpg"),
            root,
        ));
        assert!(is_under_hidden_subdir(Path::new("/vault/.git/HEAD"), root,));
    }

    #[test]
    fn under_hidden_subdir_allows_normal_files() {
        let root = Path::new("/vault");
        assert!(!is_under_hidden_subdir(
            Path::new("/vault/notes/page.md"),
            root,
        ));
        assert!(!is_under_hidden_subdir(
            Path::new("/vault/images/cover.jpg"),
            root,
        ));
    }

    #[test]
    fn under_hidden_subdir_allows_hidden_root() {
        // Vault rooted in a hidden dir is fine; only descendants matter.
        let root = Path::new("/home/me/.notes");
        assert!(!is_under_hidden_subdir(
            Path::new("/home/me/.notes/page.md"),
            root,
        ));
        assert!(is_under_hidden_subdir(
            Path::new("/home/me/.notes/.chronicler-cache/x.jpg"),
            root,
        ));
    }
}
