//! Application entry point and Tauri initialization.
//!
//! Configures the shared state and registers the API commands that the frontend can call.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use clap::Parser;
use std::path::Path;
use tauri::{AppHandle, Manager}; // Required for the app handle and runtime scope management.
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{
    fmt::format::FmtSpan, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter,
};
use world::World;

mod commands;
mod config;
mod error;
mod events;
mod fonts;
mod importer;
mod indexer;
mod licensing;
mod mediawiki_importer;
mod models;
mod parser;
mod renderer;
mod sanitizer;
mod telemetry;
mod utils;
mod watcher;
mod wikilink;
mod world;
mod writer;

/// Command-line arguments for Chronicler
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Enable debug logging
    #[arg(short, long)]
    debug: bool,
}

/// The main entry point for the Chronicler application.
///
/// This function initializes the logger, parses command-line arguments,
/// and configures and runs the Tauri application, setting up the
/// necessary state and command handlers.
fn main() {
    let args = Args::parse();

    // Load environment variables from .env file in debug builds
    #[cfg(debug_assertions)]
    dotenvy::dotenv().expect("Failed to load .env file");

    tauri::Builder::default()
        // The World state is managed directly. Its fields are
        // individually thread-safe.  This allows for more granular
        // locking and better performance, as read operations on one
        // part of the state (e.g., renderer) won't block writes on
        // another (e.g., indexer).
        .manage(World::new())
        // Add the .setup() hook here, before the plugins.
        .setup(move |app| {
            // Get a handle to the app instance to access Tauri's APIs.
            let app_handle = app.handle();

            // --- Set up tracing (logging) ---
            // This is done inside setup to get access to the app's log directory.
            setup_tracing(&args, app_handle)?;

            // On startup, we read the config file to see if a vault path was
            // saved from a previous session.
            if let Ok(Some(vault_path_str)) = config::get_vault_path(app.handle()) {
                let vault_path = Path::new(&vault_path_str);

                // Dynamically allow the asset protocol to access the last-used
                // vault directory. This grants the frontend permission to load
                // images and other files from this specific folder via URLs like
                // `asset://...`
                app.asset_protocol_scope()
                    .allow_directory(vault_path, true)?; // `true` for recursive access
            }

            // --- ANALYTICS PING ---
            // We clone the handle to pass into the async task
            let analytics_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // We ignore the result so if it fails (offline), the app continues normally.
                let _ = telemetry::send_analytics_ping(&analytics_handle).await;
            });

            // The setup was successful.
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Register all our `#[tauri::command]` functions.
        .invoke_handler(tauri::generate_handler![
            commands::get_vault_path,
            commands::get_recent_vaults,
            commands::remove_recent_vault,
            commands::initialize_vault,
            commands::get_all_tags,
            commands::render_page_preview,
            commands::build_page_view,
            commands::write_page_content,
            commands::get_file_tree,
            commands::create_new_file,
            commands::create_new_folder,
            commands::rename_path,
            commands::delete_path,
            commands::move_path,
            commands::open_in_explorer,
            commands::get_map_config,
            commands::get_all_directory_paths,
            commands::is_pandoc_installed,
            commands::download_pandoc,
            commands::import_docx_files,
            commands::import_docx_from_folder,
            commands::import_mediawiki_dump,
            commands::render_markdown,
            commands::get_linux_install_type,
            commands::get_license_status,
            commands::verify_and_store_license,
            commands::get_image_as_base64,
            commands::get_image_source,
            commands::get_app_usage_days,
            commands::duplicate_page,
            commands::get_all_broken_links,
            commands::get_all_broken_images,
            commands::get_all_parse_errors,
            commands::get_user_fonts,
            commands::open_log_directory,
        ])
        .run(tauri::generate_context!())
        .expect(r#"error while running tauri application"#);
}

/// Sets up the tracing subscriber for logging to both console and a rotating file.
fn setup_tracing(args: &Args, app_handle: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let log_level = if args.debug { "debug" } else { "info" };
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| format!("chronicler={}", log_level).into());

    // --- File Layer (Plain) ---
    let log_dir = app_handle.path().app_log_dir()?;
    let file_appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY) // Rotate daily
        .max_log_files(7) // Keep a maximum of 7 log files
        .filename_prefix("chronicler")
        .filename_suffix("log")
        .build(log_dir)?;
    let (non_blocking_appender, guard) = tracing_appender::non_blocking(file_appender);
    Box::leak(Box::new(guard)); // Keep guard alive for the app's lifetime

    let file_layer = tracing_subscriber::fmt::layer()
        .with_ansi(false) // Explicitly disable ANSI color codes for the file
        .with_writer(non_blocking_appender)
        .with_span_events(FmtSpan::CLOSE); // Log when spans (like commands) complete

    // --- Console Layer (Pretty) ---
    let console_layer = tracing_subscriber::fmt::layer()
        .pretty()
        .with_span_events(FmtSpan::CLOSE);

    // --- Combine Layers and Initialize ---
    tracing_subscriber::registry()
        .with(filter)
        .with(console_layer)
        .with(file_layer)
        .init();

    Ok(())
}
