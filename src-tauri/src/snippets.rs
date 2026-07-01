//! Per-vault, user-defined CSS snippets.
//!
//! Users drop `.css` files into `<vault>/.chronicler/snippets/`.

use crate::config::{DEBOUNCE_INTERVAL, VAULT_CONFIG_DIR_NAME};
use crate::error::{ChroniclerError, Result};
use crate::utils::{ensure_dir, has_extension, list_files_with_extension, read_file_capped};
use notify_debouncer_full::{
    new_debouncer,
    notify::{RecommendedWatcher, RecursiveMode, Watcher as NotifyWatcher},
    DebounceEventResult, Debouncer, FileIdMap,
};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tracing::{error, info, warn};

/// Event emitted to the frontend whenever a file in the snippets dir changes,
/// so it can re-read and re-apply enabled snippets (live reload).
pub const SNIPPETS_CHANGED_EVENT: &str = "snippets-changed";

/// Returns the snippets directory for a vault: `<vault>/.chronicler/snippets`.
pub fn snippets_dir(vault_root: &Path) -> PathBuf {
    vault_root.join(VAULT_CONFIG_DIR_NAME).join("snippets")
}

/// Ensures the snippets directory exists, creating it (and its `.chronicler`
/// parent) on first use.
pub fn ensure_snippets_dir(vault_root: &Path) -> Result<PathBuf> {
    Ok(ensure_dir(snippets_dir(vault_root))?)
}

/// Validates that `filename` is a bare `*.css` file name — no path separators,
/// no parent (`..`) or current (`.`) segments. This is the first line of the
/// path-traversal guard; `read_snippet_css` adds a canonicalization check for
/// symlink escapes on top of it.
///
/// The empty / `.` / `..` tests are belt-and-braces: none of those three has a
/// `file_name`, so the `.css` extension test already rejects them. They are
/// spelled out because this is a security guard and the intent should be
/// readable without reasoning about `Path` edge cases.
pub fn validate_snippet_filename(filename: &str) -> Result<()> {
    let plain = !filename.is_empty()
        && !filename.contains('/')
        && !filename.contains('\\')
        && filename != "."
        && filename != "..";
    if plain && has_extension(Path::new(filename), "css") {
        Ok(())
    } else {
        Err(ChroniclerError::InvalidPath(PathBuf::from(filename)))
    }
}

/// Lists the `.css` snippet file names in a vault's snippets dir, sorted for
/// cross-platform determinism. A missing dir yields an empty list.
pub fn list_snippet_files(vault_root: &Path) -> Result<Vec<String>> {
    Ok(list_files_with_extension(&snippets_dir(vault_root), "css")?
        .iter()
        .filter_map(|p| p.file_name().and_then(|n| n.to_str()).map(String::from))
        .collect())
}

/// Reads a single snippet's raw CSS text, guarding against path traversal.
///
/// Guards, in order:
/// 1. `filename` must be a bare `*.css` name (no separators / `..`).
/// 2. The resolved file must canonicalize to a path *inside* the canonical
///    snippets dir — this catches a `.css` symlink pointing outside the vault.
/// 3. The file must be within the size cap.
pub fn read_snippet_css(vault_root: &Path, filename: &str) -> Result<String> {
    validate_snippet_filename(filename)?;

    let dir = snippets_dir(vault_root);
    let path = dir.join(filename);

    // Canonicalize both the dir and the target, then confirm containment. This
    // rejects a `.css` symlink whose real location is outside the snippets dir.
    // A missing file/dir surfaces as FileNotFound rather than a traversal error.
    let canonical_dir =
        fs::canonicalize(&dir).map_err(|_| ChroniclerError::FileNotFound(path.clone()))?;
    let canonical_path =
        fs::canonicalize(&path).map_err(|_| ChroniclerError::FileNotFound(path.clone()))?;
    if !canonical_path.starts_with(&canonical_dir) {
        return Err(ChroniclerError::InvalidPath(path));
    }

    read_file_capped(&canonical_path)
}

/// A dedicated file watcher for a vault's snippets directory.
///
/// The main vault watcher deliberately ignores hidden subdirs (where snippets
/// live) and doesn't track `.css`, so snippet edits need their own watcher. On
/// any change it emits [`SNIPPETS_CHANGED_EVENT`] to the frontend, which
/// re-reads and re-applies enabled snippets for live reload.
///
/// Held purely for its lifetime — dropping it stops the watch thread via the
/// debouncer's `Drop`, which is why callers store it without ever reading it.
pub type SnippetWatcher = Debouncer<RecommendedWatcher, FileIdMap>;

/// Starts watching `<vault>/.chronicler/snippets`, creating the directory first
/// so the watch registers. Any failure is logged and yields `None` rather than
/// aborting vault initialization — snippets are a non-critical feature, and the
/// user can still toggle them (they just won't auto-reload).
pub fn start_snippet_watcher(vault_root: &Path, app_handle: AppHandle) -> Option<SnippetWatcher> {
    match try_start_snippet_watcher(vault_root, app_handle) {
        Ok(watcher) => Some(watcher),
        Err(e) => {
            warn!("Snippet live reload disabled: {e}");
            None
        }
    }
}

fn try_start_snippet_watcher(vault_root: &Path, app_handle: AppHandle) -> Result<SnippetWatcher> {
    let dir = ensure_snippets_dir(vault_root)?;

    let mut debouncer = new_debouncer(
        DEBOUNCE_INTERVAL,
        None,
        move |result: DebounceEventResult| {
            if let Ok(events) = result {
                if events.is_empty() {
                    return;
                }
                if let Err(e) = app_handle.emit(SNIPPETS_CHANGED_EVENT, ()) {
                    error!("Failed to emit snippets-changed event: {e}");
                }
            }
        },
    )?;

    debouncer
        .watcher()
        .watch(&dir, RecursiveMode::NonRecursive)?;

    info!("Watching snippets dir: {}", dir.display());
    Ok(debouncer)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn validates_filenames() {
        assert!(validate_snippet_filename("theme.css").is_ok());
        assert!(validate_snippet_filename("My Snippet.CSS").is_ok());
        assert!(validate_snippet_filename("../evil.css").is_err());
        assert!(validate_snippet_filename("sub/dir.css").is_err());
        assert!(validate_snippet_filename("a\\b.css").is_err());
        assert!(validate_snippet_filename("notes.txt").is_err());
        assert!(validate_snippet_filename("").is_err());
        assert!(validate_snippet_filename("..").is_err());
    }

    #[test]
    fn lists_only_css_sorted() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let sdir = ensure_snippets_dir(root).unwrap();
        fs::write(sdir.join("b.css"), "b{}").unwrap();
        fs::write(sdir.join("a.css"), "a{}").unwrap();
        fs::write(sdir.join("notes.txt"), "not css").unwrap();

        let files = list_snippet_files(root).unwrap();
        assert_eq!(files, vec!["a.css".to_string(), "b.css".to_string()]);
    }

    #[test]
    fn list_missing_dir_is_empty() {
        let dir = tempdir().unwrap();
        assert!(list_snippet_files(dir.path()).unwrap().is_empty());
    }

    #[test]
    fn reads_snippet_content() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let sdir = ensure_snippets_dir(root).unwrap();
        fs::write(sdir.join("x.css"), ".danger{color:red}").unwrap();

        assert_eq!(
            read_snippet_css(root, "x.css").unwrap(),
            ".danger{color:red}"
        );
    }

    #[test]
    fn read_rejects_traversal_name() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_snippets_dir(root).unwrap();
        // A real file sits one level above the snippets dir...
        fs::write(root.join(".chronicler").join("secret.css"), "leak").unwrap();
        // ...but the guard rejects the traversal name before any read.
        assert!(read_snippet_css(root, "../secret.css").is_err());
    }

    #[test]
    fn read_missing_file_errors() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_snippets_dir(root).unwrap();
        assert!(read_snippet_css(root, "nope.css").is_err());
    }
}
