//! Application entry point and Tauri initialization.
//!
//! Configures the shared state and registers the API commands that the frontend can call.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use crate::config::WORLD_ROOT;
use clap::Parser;
use std::path::Path;
use tauri::Manager;
use tracing_subscriber::{fmt::format::FmtSpan, EnvFilter};
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

/// Command-line arguments for Chronicler
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Enable debug logging
    #[arg(short, long)]
    debug: bool,
}

fn main() {
    let args = Args::parse();
    setup_tracing(&args);

    tauri::Builder::default()
        .setup(|app| {
            // The World will hold our entire backend's state. We've moved the lock
            // inside the World struct to protect just the Indexer, which is the part
            // that requires concurrent access management.
            let world = World::new(Path::new(WORLD_ROOT));

            world.initialize().map_err(|e| {
                tracing::error!("Failed to initialize world: {}", e);
                e
            })?;

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

/// Sets up the tracing subscriber for logging.
fn setup_tracing(args: &Args) {
    let log_level = if args.debug { "debug" } else { "info" };

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| format!("chronicler={}", log_level).into());

    let formatter = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_timer(tracing_subscriber::fmt::time::LocalTime::rfc_3339())
        .with_span_events(FmtSpan::CLOSE);

    // Use a more human-readable format for debug builds
    if cfg!(debug_assertions) {
        formatter.pretty().init();
    } else {
        formatter.init();
    }
}
