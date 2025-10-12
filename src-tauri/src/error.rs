//! Unified error handling.
//!
//! Contains all application error variants.

use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ChroniclerError {
    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("Opener error: {0}")]
    Opener(#[from] tauri_plugin_opener::Error),

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

    #[error("File not found: {0:?}")]
    FileNotFound(PathBuf),

    #[error("JSON serialization/deserialization error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("YAML serialization error: {0}")]
    Yaml(#[from] serde_yaml::Error),

    #[error("File already exists: {0:?}")]
    FileAlreadyExists(PathBuf),

    // Importer Errors
    #[error("Pandoc conversion failed for file: {0}")]
    PandocConversionFailed(String),

    #[error("Unsupported architecture for Pandoc download: {0}")]
    UnsupportedPandocArch(String),

    #[error("Invalid path provided: {0:?}")]
    InvalidPath(PathBuf),

    #[error("Network request failed: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Archive extraction failed: {0}")]
    ArchiveExtractionFailed(String),

    #[error("Could not find the pandoc executable in the expected directory.")]
    PandocNotFound,

    #[error("XML parse error: {0}")]
    XmlParse(#[from] quick_xml::Error),

    #[error("XML decode error: {0}")]
    XmlDecode(#[from] quick_xml::encoding::EncodingError),

    #[error("Glob pattern error: {0}")]
    Glob(#[from] glob::PatternError),

    #[error("License is invalid: {0}")]
    LicenseInvalid(String),

    #[error("Circular insert detected: a page is trying to insert itself, creating a loop.")]
    CircularInsert(PathBuf),
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
