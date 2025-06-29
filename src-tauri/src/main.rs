//! Application entry point and Tauri initialization.
//!
//! Configures the shared state and registers the API commands that the frontend can call.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use crate::config::WORLD_ROOT;
use std::path::Path;
use tauri::Manager;
use world::World;

mod commands;
mod config;
mod error;
mod events;
mod indexer;
mod models;
mod parser;
mod utils;
mod watcher;
mod world;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            // The World will hold our entire backend's state. We've moved the lock
            // inside the World struct to protect just the Indexer, which is the part
            // that requires concurrent access management.
            let world = World::new(Path::new(WORLD_ROOT));

            // Initialize with logging
            log::info!("Initializing world...");
            world.initialize().map_err(|e| {
                log::error!("Failed to initialize world: {}", e);
                e
            })?;
            log::info!("World initialized successfully");

            // The RwLock inside World handles the synchronization.
            // Tauri's State<World> will manage access from commands.
            app.manage(world);

            Ok(())
        })
        // Register all our `#[tauri::command]` functions.
        .invoke_handler(tauri::generate_handler![
            commands::initialize,
            commands::get_all_pages,
            commands::get_all_tags,
            commands::get_page_content,
            commands::write_page_content,
            commands::get_file_tree,
            commands::update_file,
        ])
        .run(tauri::generate_context!())
        .expect(r#"error while running tauri application"#);
}
