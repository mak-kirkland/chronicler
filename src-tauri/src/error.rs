//! Unified error handling.
//!
//! Contains all application error variants.

use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ChroniclerError {
    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("IO Error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Regex error: {0}")]
    Regex(#[from] regex::Error),

    #[error("YAML parsing error in file '{path}': {source}")]
    YamlParseError {
        source: serde_yaml::Error,
        path: PathBuf,
    },

    #[error("File Watcher Error: {0}")]
    Watcher(#[from] notify::Error),

    #[error("Path '{0}' is not a directory")]
    NotADirectory(String),

    #[error("Vault not initialized")]
    VaultNotInitialized,

    #[error("File '{path}' is too large ({size} bytes, max: {max_size} bytes)")]
    FileTooLarge {
        path: PathBuf,
        size: u64,
        max_size: u64,
    },
}

// We need to implement Serialize for the error type to be able to return
// it from Tauri commands.
impl serde::Serialize for ChroniclerError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, ChroniclerError>;
