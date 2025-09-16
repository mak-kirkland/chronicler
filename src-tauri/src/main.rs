//! Application entry point and Tauri initialization.
//!
//! Configures the shared state and registers the API commands that the frontend can call.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use clap::Parser;
use tracing_subscriber::{fmt::format::FmtSpan, EnvFilter};
use world::World;

mod commands;
mod config;
mod error;
mod events;
mod fonts; // Add the new fonts module
mod importer;
mod indexer;
mod licensing;
mod mediawiki_importer;
mod models;
mod parser;
mod renderer;
mod sanitizer;
mod template;
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
    setup_tracing(&args);

    tauri::Builder::default()
        // The World state is managed directly. Its fields are
        // individually thread-safe.  This allows for more granular
        // locking and better performance, as read operations on one
        // part of the state (e.g., renderer) won't block writes on
        // another (e.g., indexer).
        .manage(World::new())
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
            commands::get_app_usage_days,
            commands::duplicate_page,
            commands::list_templates,
            commands::read_template,
            commands::write_template,
            commands::delete_template,
            commands::get_all_broken_links,
            commands::get_user_fonts, // Register the new command
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
