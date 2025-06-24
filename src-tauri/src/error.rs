//! Custom error type and result handling

use notify::Error as NotifyError;
use regex::Error as RegexError;
use serde_yaml::Error as YamlError;
use std::io;
use thiserror::Error;

/// Unified error type for the application
#[derive(Debug, Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),

    #[error("Filesystem watcher error: {0}")]
    Notify(#[from] NotifyError),

    #[error("YAML parsing error: {0}")]
    Yaml(#[from] YamlError),

    #[error("Regex error: {0}")]
    Regex(#[from] RegexError),

    #[error("Path error: {0}")]
    Path(String),

    #[error("File error: {0}")]
    File(String),

    #[error("Invalid wikilink: {0}")]
    Wikilink(String),

    #[error("Tauri error: {0}")]
    Tauri(String),

    #[error("Custom error: {0}")]
    Custom(String),
}

// Implement serialization for Tauri error passing
impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Custom result type for the application
pub type Result<T> = std::result::Result<T, AppError>;

// Conversion helpers
impl From<&str> for AppError {
    fn from(value: &str) -> Self {
        AppError::Custom(value.to_string())
    }
}

impl From<String> for AppError {
    fn from(value: String) -> Self {
        AppError::Custom(value)
    }
}

impl From<tauri::Error> for AppError {
    fn from(error: tauri::Error) -> Self {
        AppError::Tauri(error.to_string())
    }
}

impl<T: std::fmt::Display> From<atomicwrites::Error<T>> for AppError {
    fn from(error: atomicwrites::Error<T>) -> Self {
        match error {
            atomicwrites::Error::Internal(err) => AppError::Io(err),
            atomicwrites::Error::User(err) => {
                AppError::File(format!("Atomic write failed: {}", err))
            }
        }
    }
}
