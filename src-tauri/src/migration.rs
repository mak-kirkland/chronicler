//! One-time migration from the legacy bundle identifier
//! `io.github.mak-kirkland.chronicler` to the new `pro.chronicler`.
//!
//! When the bundle identifier changes, every per-OS directory keyed off it
//! also changes — Linux `~/.config/<id>/` and `~/.local/share/<id>/`, macOS
//! `~/Library/Application Support/<id>/`, Windows `%APPDATA%\<id>\`. Without
//! migration, existing users would launch the new build to a fresh state:
//! no vault path, no recent vaults, no license, no fonts, no templates, no
//! saved theme. This module copies the user-data files and directories that
//! actually matter into the new locations on first launch.
//!
//! Strategy:
//!   * Copy, don't move. The legacy directories are left untouched as a
//!     fallback in case the migration ships with a bug. A future release
//!     can prompt to delete them once the dust has settled.
//!   * Idempotent. A `migrated.v1` sentinel in the new config dir signals
//!     "done"; subsequent launches return immediately. Items already
//!     present at the destination are skipped rather than overwritten, so
//!     partial-failure recovery is safe.
//!   * Best-effort. A failure copying any single file is logged and
//!     skipped — it must not abort the rest of the migration or block app
//!     startup. The user can always relaunch the old build to recover the
//!     untouched original.
//!
//! What gets migrated (the rest is regenerable WebKit cache, temp files,
//! or bundled binaries that re-download on demand):
//!   * `app_config_dir`: `config.json`, `license.json`, `fonts/`, `templates/`
//!   * `app_data_dir`:   `global.settings.json`, `localstorage/`
//!   * `app_log_dir`:    historical log files, merged file-by-file (the
//!                       active session's log is already open in the new
//!                       location by the time we run, so we never overwrite
//!                       it).
//!
//! What does NOT need migrating:
//!   * Updater pubkey/endpoint — both live in `tauri.conf.json`, not derived
//!     from the bundle ID, so the same signed-update channel keeps working.
//!   * License keys — bound to file content, not bundle ID. Carried in
//!     `license.json` above.
//!   * WebKit caches (`WebKitCache/`, `CacheStorage/`, `cookies`,
//!     `hsts-storage.sqlite`, `mediakeys/`, `keygen/`, `storage/`) — WebKit
//!     regenerates these on first launch.

use crate::error::Result;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tracing::{info, warn};

/// Legacy bundle identifier. The new identifier is whatever
/// `tauri.conf.json` currently says.
const LEGACY_IDENTIFIER: &str = "io.github.mak-kirkland.chronicler";

/// Sentinel filename written into the *new* config dir once migration runs
/// to completion. Versioned so a future migration step can use a different
/// name and re-trigger without disturbing this one.
const SENTINEL_FILE: &str = "migrated.v1";

/// Items in `app_config_dir` worth carrying over. Anything not on this list
/// (e.g. `pandoc-3.7.0.2/`, `config.json~`, the legacy `conf.json` artifact)
/// is intentionally left behind: regenerable, temp-file orphans, or unused.
const CONFIG_ITEMS: &[&str] = &["config.json", "license.json", "fonts", "templates"];

/// Items in `app_data_dir` worth carrying over. WebKit runtime caches and
/// the legacy `.settings.dat` file are deliberately excluded.
const DATA_ITEMS: &[&str] = &["global.settings.json", "localstorage"];

// Logs are migrated separately because `app_log_dir` is *not* a subdir of
// `app_data_dir` on every platform:
//   Linux:   `~/.local/share/<id>/logs`        (under data dir)
//   macOS:   `~/Library/Logs/<id>`             (separate from data dir)
//   Windows: `%LOCALAPPDATA%\<id>\logs`        (under *local* app data,
//                                               while `app_data_dir` is
//                                               %APPDATA% — the *roaming*
//                                               profile)
// Treating logs uniformly via DATA_ITEMS would silently miss them on macOS
// and Windows, so they get their own resolver and a per-file merge.

/// Runs the legacy-identifier migration. Safe to call on every launch:
/// returns immediately if the sentinel exists or there is no legacy data.
///
/// The returned `Result` only surfaces errors that mean we couldn't even
/// resolve the new directories (i.e. Tauri's path resolver failed). Per-file
/// copy failures are logged and swallowed — losing one file is preferable
/// to aborting the migration partway and leaving the user with an
/// inconsistent state.
pub fn run(app_handle: &AppHandle) -> Result<()> {
    let new_config = app_handle.path().app_config_dir()?;

    // Fast path: already migrated.
    if new_config.join(SENTINEL_FILE).exists() {
        return Ok(());
    }

    let new_data = app_handle.path().app_data_dir()?;
    let new_logs = app_handle.path().app_log_dir()?;

    let old_config = legacy_config_dir();
    let old_data = legacy_data_dir();
    let old_logs = legacy_log_dir();

    let old_config_exists = old_config.as_deref().is_some_and(Path::exists);
    let old_data_exists = old_data.as_deref().is_some_and(Path::exists);
    let old_logs_exists = old_logs.as_deref().is_some_and(Path::exists);

    if !old_config_exists && !old_data_exists && !old_logs_exists {
        // Fresh install with no legacy footprint. Stamp the sentinel so we
        // don't probe the filesystem on every subsequent launch.
        write_sentinel(&new_config);
        return Ok(());
    }

    info!(
        "Migrating user data from legacy identifier `{LEGACY_IDENTIFIER}`. \
         old_config_exists={old_config_exists} old_data_exists={old_data_exists} \
         old_logs_exists={old_logs_exists}"
    );

    if let Some(old) = old_config.as_deref() {
        for name in CONFIG_ITEMS {
            copy_if_missing(&old.join(name), &new_config.join(name));
        }
    }

    if let Some(old) = old_data.as_deref() {
        // The new data dir may not have been touched yet — `app_data_dir`
        // resolves a path but doesn't create it. Create before writing into it.
        if let Err(e) = fs::create_dir_all(&new_data) {
            warn!("Could not create new data dir {}: {e}", new_data.display());
        }
        for name in DATA_ITEMS {
            copy_if_missing(&old.join(name), &new_data.join(name));
        }
    }

    if let Some(old) = old_logs.as_deref() {
        // `setup_tracing` ran before us and is already writing to today's
        // log file in `new_logs`, so we can't `copy_if_missing` the whole
        // directory (it exists). Merge contents instead — `copy_if_missing`
        // skips per-file, leaving today's active log untouched.
        merge_dir_contents(old, &new_logs);
    }

    write_sentinel(&new_config);
    info!("Migration complete. Legacy directories left in place as a fallback.");
    Ok(())
}

/// Linux: `$XDG_CONFIG_HOME` (or `$HOME/.config`) + `/<legacy-id>`.
/// macOS: `$HOME/Library/Application Support/<legacy-id>`.
/// Windows: `%APPDATA%\<legacy-id>` (Roaming).
///
/// Mirrors Tauri 2's `app_config_dir` so the path we look up is the same
/// one the old build wrote to.
fn legacy_config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join(LEGACY_IDENTIFIER))
}

/// Linux: `$XDG_DATA_HOME` (or `$HOME/.local/share`) + `/<legacy-id>`.
/// macOS: `$HOME/Library/Application Support/<legacy-id>` (== config dir).
/// Windows: `%APPDATA%\<legacy-id>` (== config dir).
///
/// On macOS and Windows this collapses to the same directory as
/// `legacy_config_dir`; the migration handles that correctly because the
/// CONFIG_ITEMS and DATA_ITEMS lists do not overlap.
fn legacy_data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|p| p.join(LEGACY_IDENTIFIER))
}

/// Mirrors Tauri 2's `app_log_dir` resolution for the legacy identifier:
///   macOS:   `$HOME/Library/Logs/<legacy-id>`
///   Linux:   `$HOME/.local/share/<legacy-id>/logs` (== `data_local_dir`)
///   Windows: `%LOCALAPPDATA%\<legacy-id>\logs`     (== `data_local_dir`)
///
/// Using `data_local_dir` rather than `data_dir` is the load-bearing detail
/// on Windows: roaming-profile (`%APPDATA%`) and local-profile
/// (`%LOCALAPPDATA%`) are different directories, and Tauri puts logs under
/// the local one.
fn legacy_log_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir().map(|p| p.join("Library/Logs").join(LEGACY_IDENTIFIER))
    }
    #[cfg(not(target_os = "macos"))]
    {
        dirs::data_local_dir().map(|p| p.join(LEGACY_IDENTIFIER).join("logs"))
    }
}

fn write_sentinel(config_dir: &Path) {
    if let Err(e) = fs::create_dir_all(config_dir) {
        warn!(
            "Could not create new config dir {} for sentinel: {e}",
            config_dir.display()
        );
        return;
    }
    let sentinel = config_dir.join(SENTINEL_FILE);
    let body = format!(
        "Migrated from {LEGACY_IDENTIFIER}.\nThis file marks the migration complete; safe to delete.\n"
    );
    if let Err(e) = fs::write(&sentinel, body) {
        warn!(
            "Could not write migration sentinel {}: {e}",
            sentinel.display()
        );
    }
}

/// Copies every entry from `src_dir` into `dst_dir`, skipping entries that
/// already exist at the destination. Used for merging into directories that
/// the new build has already created and may be writing to (notably the log
/// dir, which `setup_tracing` initialises before us).
fn merge_dir_contents(src_dir: &Path, dst_dir: &Path) {
    if !src_dir.exists() {
        return;
    }
    if let Err(e) = fs::create_dir_all(dst_dir) {
        warn!(
            "Could not create destination dir {} for merge: {e}",
            dst_dir.display()
        );
        return;
    }
    let entries = match fs::read_dir(src_dir) {
        Ok(it) => it,
        Err(e) => {
            warn!("Could not read source dir {}: {e}", src_dir.display());
            return;
        }
    };
    for entry in entries.flatten() {
        let from = entry.path();
        let to = dst_dir.join(entry.file_name());
        copy_if_missing(&from, &to);
    }
}

/// Copies `src` to `dst` iff `src` exists and `dst` does not. Logs failures
/// and continues so a single bad file can't abort the migration. Recurses
/// into directories.
fn copy_if_missing(src: &Path, dst: &Path) {
    if !src.exists() {
        return;
    }
    if dst.exists() {
        info!(
            "Skipping {} — destination {} already exists.",
            src.display(),
            dst.display()
        );
        return;
    }

    let result = if src.is_dir() {
        copy_dir_recursive(src, dst)
    } else {
        if let Some(parent) = dst.parent() {
            // Best-effort; the copy itself will surface any real failure.
            let _ = fs::create_dir_all(parent);
        }
        fs::copy(src, dst).map(|_| ())
    };

    match result {
        Ok(()) => info!("Migrated {} -> {}", src.display(), dst.display()),
        Err(e) => warn!(
            "Failed to migrate {} -> {}: {e}",
            src.display(),
            dst.display()
        ),
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else if file_type.is_symlink() {
            // Preserve symlinks rather than dereferencing them. Dereferencing
            // could materialise large/cyclic targets we never intended to
            // copy. On Windows symlink creation requires elevated privileges
            // and our config trees rarely contain them, so we skip there.
            #[cfg(unix)]
            {
                let target = fs::read_link(&from)?;
                std::os::unix::fs::symlink(target, &to)?;
            }
            #[cfg(windows)]
            {
                warn!(
                    "Skipping symlink {} on Windows (requires elevated privileges).",
                    from.display()
                );
            }
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}
