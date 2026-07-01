//! Application configuration management.
//!
//! Handles application-wide constants, loading and saving of user
//! settings, such as the vault path.  The configuration is stored in
//! a JSON file in the app's config directory.

use crate::error::Result;
use crate::writer::atomic_write;
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tracing::{error, warn};

/// The debounce interval for file changes in milliseconds.
/// This helps prevent multiple rapid updates from triggering too many re-indexes.
pub const DEBOUNCE_INTERVAL: Duration = Duration::from_millis(750);

/// Maximum time we wait before forcing a process, to prevent infinite delay
/// if a process is constantly spamming events.
pub const MAX_DEBOUNCE_DELAY: Duration = Duration::from_secs(2);

/// Maximum file size to parse (1MB)
pub const MAX_FILE_SIZE: u64 = 1024 * 1024;

/// The default capacity for the broadcast channel.
/// This determines how many events can be buffered before older events are dropped.
///
/// A capacity of 100 should be sufficient for most use cases, as events are typically
/// processed quickly. If you have very high file change rates or slow subscribers,
/// you might need to increase this value.
pub const DEFAULT_EVENT_CHANNEL_CAPACITY: usize = 100;

/// The name of the directory within the vault where images and other media are stored.
pub const IMAGES_DIR_NAME: &str = "images";

/// Hidden cache directory inside the vault for derived assets (map tile
/// pyramids, gallery thumbnails, etc.). Starts with `.` so the vault
/// indexer skips it during file scanning. Must stay in sync with the
/// asset-protocol scope registered in `world::configure_vault_scope`.
pub const VAULT_CACHE_DIR_NAME: &str = ".chronicler-cache";

/// Hidden directory inside the vault holding user-authored configuration that
/// travels *with* the vault — CSS snippets, calendar definitions. Distinct from
/// [`VAULT_CACHE_DIR_NAME`], which holds regenerable derived assets. Starts with
/// `.` so the vault indexer and watcher skip it during file scanning.
pub const VAULT_CONFIG_DIR_NAME: &str = ".chronicler";

/// Defines the structure of the application's configuration file.
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub vault_path: Option<String>,
    /// A list of previously opened vault paths, ordered by most recent.
    #[serde(default)]
    pub recent_vaults: Vec<String>,
    pub first_launch_date: Option<String>,
    /// The user's telemetry choice. `None` means they haven't been asked yet
    /// (the consent modal is shown in this case, and no ping is sent).
    /// `Some(true)` means opted in; `Some(false)` means opted out.
    #[serde(default)]
    pub telemetry_enabled: Option<bool>,
    /// Whether the one-time analytics ping has been successfully sent for
    /// this install. Once true, the app skips the ping on subsequent launches
    /// so we don't keep billing serverless invocations for a user we've
    /// already counted.
    #[serde(default)]
    pub analytics_ping_sent: bool,
    /// Enabled CSS snippet file names, keyed by vault path. Stored here — in the
    /// app config, **not** inside the vault — so a shared or downloaded vault can
    /// never arrive with its snippets pre-enabled. Enabling a snippet is always
    /// an explicit local action, which is the crux of the opt-in trust model.
    ///
    /// A `BTreeSet` gives dedup for free and a stable on-disk order; it
    /// serializes as the same JSON array a `Vec` would, so existing configs
    /// load unchanged.
    #[serde(default)]
    pub enabled_snippets: HashMap<String, BTreeSet<String>>,
}

/// Retrieves the path to the configuration file.
///
/// Ensures the configuration directory exists, creating it if necessary.
fn get_config_path(app_handle: &AppHandle) -> Result<PathBuf> {
    let config_dir = app_handle.path().app_config_dir()?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)?;
    }
    Ok(config_dir.join("config.json"))
}

/// Renames a corrupt config file aside so the app can start fresh. Failure
/// to quarantine is logged but doesn't block recovery — the default config
/// is used either way.
fn quarantine_corrupt_config(path: &std::path::Path) {
    // Append ".corrupt-<ts>" to the original path rather than using
    // with_extension, which would replace ".json" instead of appending.
    let timestamp = Local::now().format("%Y%m%d-%H%M%S");
    let mut backup = path.as_os_str().to_os_string();
    backup.push(format!(".corrupt-{}", timestamp));
    let backup_path = std::path::PathBuf::from(backup);

    match fs::rename(path, &backup_path) {
        Ok(_) => warn!(
            "Quarantined corrupt config to {}; using default config.",
            backup_path.display()
        ),
        Err(e) => error!(
            "Failed to quarantine corrupt config at {}: {}. Using default config.",
            path.display(),
            e
        ),
    }
}

/// Loads the application configuration from disk.
///
/// Deliberately defensive: a corrupt config must never prevent startup,
/// because the config dir (`%APPDATA%` on Windows) is not cleared on
/// reinstall. On unreadable or unparseable files, the corrupt file is
/// quarantined and a default config is returned.
pub fn load(app_handle: &AppHandle) -> Result<AppConfig> {
    let path = get_config_path(app_handle)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => {
            warn!(
                "Could not read config file at {}: {}. Using default config.",
                path.display(),
                e
            );
            return Ok(AppConfig::default());
        }
    };

    match serde_json::from_str(&content) {
        Ok(config) => Ok(config),
        Err(e) => {
            warn!(
                "Config file at {} is corrupt and could not be parsed: {}. \
                 Quarantining and using default config.",
                path.display(),
                e
            );
            quarantine_corrupt_config(&path);
            Ok(AppConfig::default())
        }
    }
}

/// Saves the application configuration to disk atomically and durably.
pub fn save(app_handle: &AppHandle, config: &AppConfig) -> Result<()> {
    let path = get_config_path(app_handle)?;
    let content = serde_json::to_string_pretty(config)?;
    atomic_write(&path, &content)
}

/// Gets the vault path directly from the config file.
pub fn get_vault_path(app_handle: &AppHandle) -> Result<Option<String>> {
    let config = load(app_handle)?;
    Ok(config.vault_path)
}

/// Sets and saves the vault path in the config file.
/// This also updates the `recent_vaults` list, moving the new path to the top.
pub fn set_vault_path(path: String, app_handle: &AppHandle) -> Result<()> {
    let mut config = load(app_handle)?;

    // Update the current vault path
    config.vault_path = Some(path.clone());

    // Update recent vaults list
    // 1. Remove the path if it already exists (so we can move it to the top)
    config.recent_vaults.retain(|p| p != &path);
    // 2. Insert at the beginning
    config.recent_vaults.insert(0, path);
    // 3. Limit the list to 10 entries to keep it tidy
    if config.recent_vaults.len() > 10 {
        config.recent_vaults.truncate(10);
    }

    save(app_handle, &config)
}

/// Removes a specific vault path from the recent vaults list.
pub fn remove_recent_vault(path: String, app_handle: &AppHandle) -> Result<()> {
    let mut config = load(app_handle)?;
    config.recent_vaults.retain(|p| p != &path);
    save(app_handle, &config)
}

/// Persists the user's telemetry choice.
pub fn set_telemetry_enabled(enabled: bool, app_handle: &AppHandle) -> Result<()> {
    let mut config = load(app_handle)?;
    config.telemetry_enabled = Some(enabled);
    save(app_handle, &config)
}

/// Marks the one-time analytics ping as sent so future launches skip it.
pub fn mark_analytics_ping_sent(app_handle: &AppHandle) -> Result<()> {
    let mut config = load(app_handle)?;
    config.analytics_ping_sent = true;
    save(app_handle, &config)
}

/// Builds the config key for a vault. The enabled-snippets map is keyed by the
/// vault's path, so the conversion lives here rather than at each call site.
fn vault_key(vault_path: &Path) -> String {
    vault_path.to_string_lossy().into_owned()
}

/// Returns the enabled CSS snippet file names for a given vault.
pub fn get_enabled_snippets(app_handle: &AppHandle, vault_path: &Path) -> Result<BTreeSet<String>> {
    let config = load(app_handle)?;
    Ok(config
        .enabled_snippets
        .get(&vault_key(vault_path))
        .cloned()
        .unwrap_or_default())
}

/// Enables or disables a snippet for a vault, persisting the change. A vault
/// whose set becomes empty is pruned from the map to keep the config tidy.
pub fn set_snippet_enabled(
    app_handle: &AppHandle,
    vault_path: &Path,
    filename: &str,
    enabled: bool,
) -> Result<()> {
    let key = vault_key(vault_path);
    let mut config = load(app_handle)?;
    let names = config.enabled_snippets.entry(key.clone()).or_default();

    if enabled {
        names.insert(filename.to_string());
    } else {
        names.remove(filename);
    }

    if names.is_empty() {
        config.enabled_snippets.remove(&key);
    }

    save(app_handle, &config)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `enabled_snippets` is persisted user state. It was once a `Vec<String>`
    /// and is now a `BTreeSet<String>`; both serialize as a JSON array, so
    /// configs written by older builds must still load.
    #[test]
    fn enabled_snippets_loads_legacy_vec_shape() {
        // Exactly what an older build wrote: a JSON array, unsorted, with a
        // duplicate that the Vec representation permitted.
        let legacy = r#"{
            "vault_path": "/home/me/vault",
            "enabled_snippets": {
                "/home/me/vault": ["z.css", "a.css", "a.css"]
            }
        }"#;

        let config: AppConfig = serde_json::from_str(legacy).unwrap();
        let names = config.enabled_snippets.get("/home/me/vault").unwrap();

        // The duplicate collapses and the order normalizes.
        assert_eq!(
            names.iter().cloned().collect::<Vec<_>>(),
            vec!["a.css".to_string(), "z.css".to_string()]
        );

        // Round-trips back out as a plain JSON array, so an older build could
        // still read what we write.
        let json = serde_json::to_value(&config).unwrap();
        assert_eq!(
            json["enabled_snippets"]["/home/me/vault"],
            serde_json::json!(["a.css", "z.css"])
        );
    }

    /// A config from before the feature existed has no key at all.
    #[test]
    fn enabled_snippets_defaults_when_absent() {
        let config: AppConfig = serde_json::from_str(r#"{"vault_path": null}"#).unwrap();
        assert!(config.enabled_snippets.is_empty());
    }
}
