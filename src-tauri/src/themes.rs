//! Per-file theme storage.
//!
//! Custom themes live as individual `.json` files in
//! `<app_config_dir>/themes/`. The on-disk filename is a slug derived from the
//! theme's `name` field, but the canonical identifier is the in-file `name` —
//! we look files up by reading that field so renames don't orphan a theme.

use crate::error::{ChroniclerError, Result};
use crate::writer::atomic_write;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tracing::warn;

const THEMES_DIR_NAME: &str = "themes";

/// Returns the directory used for per-theme storage, creating it on first use.
pub fn themes_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_config_dir()?.join(THEMES_DIR_NAME);
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

/// Returns a filesystem-safe slug for a theme name, falling back to `"theme"`
/// when the input has nothing usable.
fn slugify(name: &str) -> String {
    let s = slug::slugify(name);
    if s.is_empty() {
        "theme".to_string()
    } else {
        s
    }
}

/// Reads the `name` field of a theme file. Returns `None` for missing,
/// unreadable, or malformed files — all "not this theme" outcomes.
fn read_theme_name(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&content).ok()?;
    value
        .get("name")
        .and_then(|n| n.as_str())
        .map(|s| s.to_string())
}

/// Scans the themes directory for the file whose `name` field matches.
/// Used as a fallback when the slug-derived path doesn't match (e.g. a
/// user manually renamed a file outside the app).
fn find_theme_file(dir: &Path, name: &str) -> Result<Option<PathBuf>> {
    if !dir.exists() {
        return Ok(None);
    }
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if read_theme_name(&path).as_deref() == Some(name) {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

/// Allocates a path for a brand-new theme file, appending `-2`, `-3`, … when
/// the desired slug is already taken on disk.
fn unique_theme_path(dir: &Path, slug: &str) -> PathBuf {
    let mut path = dir.join(format!("{}.json", slug));
    let mut i = 2;
    while path.exists() {
        path = dir.join(format!("{}-{}.json", slug, i));
        i += 1;
    }
    path
}

/// Resolves the on-disk path for a theme with this `name`, fast-pathing the
/// common case where the slug-derived filename matches.
fn resolve_theme_path(dir: &Path, name: &str) -> Result<PathBuf> {
    let slug = slugify(name);
    let slug_path = dir.join(format!("{}.json", slug));
    if read_theme_name(&slug_path).as_deref() == Some(name) {
        return Ok(slug_path);
    }
    if let Some(p) = find_theme_file(dir, name)? {
        return Ok(p);
    }
    Ok(unique_theme_path(dir, &slug))
}

/// Loads every theme JSON from disk. Unparseable files are skipped with a
/// warning rather than aborting the whole list — one bad file should never
/// hide all the others. Results are sorted by filename for cross-platform
/// determinism.
pub fn list_themes(app: &AppHandle) -> Result<Vec<Value>> {
    let dir = themes_dir(app)?;
    let mut paths: Vec<PathBuf> = fs::read_dir(&dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    paths.sort();

    let mut themes = Vec::with_capacity(paths.len());
    for path in paths {
        match fs::read_to_string(&path).and_then(|c| {
            serde_json::from_str::<Value>(&c)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
        }) {
            Ok(v) => themes.push(v),
            Err(e) => warn!(
                "Skipping unparseable theme file {}: {}",
                path.display(),
                e
            ),
        }
    }
    Ok(themes)
}

/// Writes a theme JSON to disk.
///
/// - When `target` is `None`, the theme is written to the app's managed
///   themes directory (creating a new slug-based file, or overwriting the
///   existing file for this theme name — i.e. an in-place update).
/// - When `target` is `Some(path)`, the theme is written exactly to that
///   path (the Export flow, where the user picked a destination via the
///   OS save dialog).
pub fn save_theme(app: &AppHandle, theme: Value, target: Option<&Path>) -> Result<()> {
    let path = match target {
        Some(p) => p.to_path_buf(),
        None => {
            let name = theme
                .get("name")
                .and_then(|n| n.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    ChroniclerError::Theme("Theme must have a non-empty `name`".into())
                })?;
            let dir = themes_dir(app)?;
            resolve_theme_path(&dir, &name)?
        }
    };
    let content = serde_json::to_string_pretty(&theme)?;
    atomic_write(&path, &content)
}

/// Removes the file whose `name` field matches. Silently succeeds when no
/// such file exists — callers don't need to care whether the theme was
/// already absent.
pub fn delete_theme(app: &AppHandle, name: &str) -> Result<()> {
    let dir = themes_dir(app)?;
    let slug_path = dir.join(format!("{}.json", slugify(name)));
    let path = if read_theme_name(&slug_path).as_deref() == Some(name) {
        Some(slug_path)
    } else {
        find_theme_file(&dir, name)?
    };
    if let Some(p) = path {
        fs::remove_file(p)?;
    }
    Ok(())
}

/// Reads and parses a theme JSON from a user-chosen path (Import flow).
/// The frontend re-validates the shape; here we only guarantee it's
/// well-formed JSON.
pub fn import_theme_from_path(path: &Path) -> Result<Value> {
    let content = fs::read_to_string(path)?;
    let value: Value = serde_json::from_str(&content)?;
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::slugify;

    #[test]
    fn slugify_empty_falls_back() {
        assert_eq!(slugify(""), "theme");
        assert_eq!(slugify("!!!"), "theme");
    }
}
