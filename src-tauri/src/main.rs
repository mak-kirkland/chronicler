//! Main entry point for the Tauri application

mod commands;
mod debouncer;
mod error;
mod fs_manager;
mod markdown;

use crate::error::Result;
use crate::fs_manager::FsManager;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::generate_handler;

/// How often the background thread polls for file manager changes
const POLL_INTERVAL_MS: u64 = 500;
/// World root directory relative to the system's documents or home directory
const WORLD_DIR: &str = "DnDWorld";

/// Gets the system's documents directory or falls back to home/current directory
fn document_dir() -> Option<PathBuf> {
    dirs_next::document_dir()
        .or_else(dirs_next::home_dir)
        .or_else(|| std::env::current_dir().ok())
}

fn main() -> Result<()> {
    // Set up world root directory: ~/Documents/DnDWorld
    let world_root = document_dir()
        .ok_or("Could not locate documents directory")?
        .join(WORLD_DIR);

    // Create directory if it doesn't exist
    if !world_root.exists() {
        std::fs::create_dir_all(&world_root)?;
        log::info!("Created world directory: {}", world_root.display());
    }

    // Initialize filesystem manager with world root
    let fs_manager = Arc::new(Mutex::new(FsManager::new(world_root.clone())?));
    log::info!("World root: {}", world_root.display());

    // Clone for background thread
    let fs_manager_clone = fs_manager.clone();

    // Spawn background thread for periodic change checking
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));

        match fs_manager_clone.lock() {
            Ok(mut manager) => {
                if let Err(e) = manager.check_for_changes() {
                    log::error!("Change check error: {}", e);
                }
            }
            Err(e) => log::error!("Lock error: {}", e),
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        // Manage filesystem state
        .manage(fs_manager)
        // Register command handlers
        .invoke_handler(generate_handler![
            commands::get_file_content,
            commands::save_file,
            commands::get_tag_index,
            commands::get_backlinks,
            commands::create_directory,
            commands::list_directory,
            commands::resolve_wikilink,
            commands::get_image,
        ])
        .setup(|_app| {
            log::info!("Application setup complete");
            Ok(())
        })
        .run(tauri::generate_context!())
        .map_err(|e| e.into())
}
