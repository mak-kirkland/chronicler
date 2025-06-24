//! Tauri command handlers for filesystem operations

use crate::{error::AppError, error::Result, fs_manager::FsManager, markdown::parse_markdown};
use atomicwrites::{AllowOverwrite, AtomicFile};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::State;

/// Reads file content with markdown parsing
#[tauri::command]
pub async fn get_file_content(
    fs_manager: State<'_, Arc<Mutex<FsManager>>>,
    path: PathBuf,
) -> Result<String> {
    let manager = fs_manager.lock().unwrap(); // Blocking lock is OK
    let abs_path = manager.world_root.join(&path);

    // Read and parse markdown
    let content = std::fs::read_to_string(&abs_path)?;
    let parsed = parse_markdown(&content)?;

    // Return JSON with parsed data
    serde_json::to_string(&parsed).map_err(|e| format!("Serialization error: {}", e).into())
}

/// Saves content to a file
#[tauri::command]
pub async fn save_file(
    fs_manager: State<'_, Arc<Mutex<FsManager>>>,
    path: PathBuf,
    content: String,
) -> Result<()> {
    let manager = fs_manager
        .lock()
        .map_err(|e| AppError::File(e.to_string()))?;
    let abs_path = manager.world_root.join(&path);

    // Create parent directories if needed
    if let Some(parent) = abs_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // Write file atomically with fsync
    let af = AtomicFile::new(&abs_path, AllowOverwrite);
    af.write(|f| -> Result<()> {
        f.write_all(content.as_bytes())?;
        f.sync_all()?;
        Ok(())
    })?; // Will convert via our From<atomicwrites::Error> impl

    log::info!("File saved atomically: {}", path.display());
    Ok(())
}

/// Gets files with a specific tag
#[tauri::command]
pub async fn get_tag_index(
    fs_manager: State<'_, Arc<Mutex<FsManager>>>,
    tag: String,
) -> Result<Vec<PathBuf>> {
    let manager = fs_manager.lock().unwrap();
    Ok(manager.get_tag_files(&tag))
}

/// Gets backlinks for a file
#[tauri::command]
pub async fn get_backlinks(
    fs_manager: State<'_, Arc<Mutex<FsManager>>>,
    path: PathBuf,
) -> Result<Vec<PathBuf>> {
    let manager = fs_manager.lock().unwrap();
    Ok(manager.get_backlinks(&path))
}

/// Creates a new directory
#[tauri::command]
pub async fn create_directory(
    fs_manager: State<'_, Arc<Mutex<FsManager>>>,
    path: PathBuf,
) -> Result<()> {
    let manager = fs_manager.lock().unwrap();
    let abs_path = manager.world_root.join(&path);
    std::fs::create_dir_all(&abs_path)?;
    Ok(())
}

/// Lists directory contents
#[tauri::command]
pub async fn list_directory(
    fs_manager: State<'_, Arc<Mutex<FsManager>>>,
    path: PathBuf,
) -> Result<Vec<PathBuf>> {
    let manager = fs_manager.lock().unwrap();
    let abs_path = manager.world_root.join(&path);

    let mut contents = Vec::new();
    for entry in std::fs::read_dir(&abs_path)? {
        let entry = entry?;
        let rel_path = path_relative_to(&entry.path(), &manager.world_root)?;
        contents.push(rel_path);
    }

    Ok(contents)
}

/// Resolves a wikilink to a valid path
#[tauri::command]
pub async fn resolve_wikilink(
    fs_manager: State<'_, Arc<Mutex<FsManager>>>,
    current_path: PathBuf,
    link: String,
) -> Result<PathBuf> {
    let manager = fs_manager.lock().unwrap();
    manager.resolve_wikilink(&current_path, &link)
}

#[tauri::command]
pub async fn get_image(
    fs_manager: State<'_, Arc<Mutex<FsManager>>>,
    path: PathBuf,
) -> Result<Vec<u8>> {
    let manager = fs_manager.lock().unwrap();
    let abs_path = manager.world_root.join(path);
    std::fs::read(&abs_path).map_err(|e| e.into())
}

/// Helper to get relative path
fn path_relative_to(path: &Path, base: &Path) -> Result<PathBuf> {
    path.strip_prefix(base)
        .map(|p| p.to_path_buf())
        .map_err(|_| format!("Path '{}' not in base directory", path.display()).into())
}
