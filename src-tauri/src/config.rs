//! Application configuration management.
//!
//! Handles application-wide constants, loading and saving of user
//! settings, such as the vault path.  The configuration is stored in
//! a JSON file in the app's config directory.

use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// The debounce interval for file changes in milliseconds.
/// This helps prevent multiple rapid updates from triggering too many re-indexes.
pub const DEBOUNCE_INTERVAL: Duration = Duration::from_millis(500);

/// Maximum file size to parse (1MB)
pub const MAX_FILE_SIZE: u64 = 1024 * 1024;

/// The default capacity for the broadcast channel.
/// This determines how many events can be buffered before older events are dropped.
///
/// A capacity of 100 should be sufficient for most use cases, as events are typically
/// processed quickly. If you have very high file change rates or slow subscribers,
/// you might need to increase this value.
pub const DEFAULT_EVENT_CHANNEL_CAPACITY: usize = 100;

/// Defines the structure of the application's configuration file.
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub vault_path: Option<String>,
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

/// Loads the application configuration from disk.
///
/// If no configuration file exists, it returns a default configuration.
pub fn load(app_handle: &AppHandle) -> Result<AppConfig> {
    let path = get_config_path(app_handle)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let content = fs::read_to_string(path)?;
    serde_json::from_str(&content).map_err(Into::into)
}

/// Saves the application configuration to disk.
pub fn save(app_handle: &AppHandle, config: &AppConfig) -> Result<()> {
    let path = get_config_path(app_handle)?;
    let content = serde_json::to_string_pretty(config)?;
    fs::write(path, content).map_err(Into::into)
}

/// Gets the vault path directly from the config file.
pub fn get_vault_path(app_handle: &AppHandle) -> Result<Option<String>> {
    let config = load(app_handle)?;
    Ok(config.vault_path)
}

/// Sets and saves the vault path in the config file.
pub fn set_vault_path(path: String, app_handle: &AppHandle) -> Result<()> {
    let mut config = load(app_handle)?;
    config.vault_path = Some(path);
    save(app_handle, &config)
}
