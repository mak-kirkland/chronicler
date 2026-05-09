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
mod migration;
mod models;
mod parser;
mod renderer;
mod sanitizer;
mod telemetry;
mod thumbnailer;
mod tiler;
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
    // Apply Linux WebKitGTK / NVIDIA compatibility env vars *before* anything
    // else. GTK and WebKit read these during their own initialisation, which
    // happens inside `tauri::Builder::default().run()`, so we only have until
    // then to influence them.
    apply_linux_compat_env();

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

            // --- Legacy-identifier migration ---
            // Must run *before* any code reads from `app_config_dir` /
            // `app_data_dir`, so the rest of startup sees the migrated
            // config rather than a fresh one. Failures are non-fatal:
            // the legacy directories are left untouched, so the user can
            // always relaunch the previous build to recover.
            if let Err(e) = migration::run(app_handle) {
                tracing::warn!("Legacy-identifier migration could not run: {e}");
            }

            // On startup, we read the config file to see if a vault path was
            // saved from a previous session. `configure_vault_scope` handles
            // both the vault dir and the hidden cache dir, and pre-creates
            // the cache dir so `allow_directory` registers it correctly
            // even on first launch.
            if let Ok(Some(vault_path_str)) = config::get_vault_path(app.handle()) {
                let vault_path = Path::new(&vault_path_str);
                world::configure_vault_scope(app.handle(), vault_path);
            }

            // --- ANALYTICS PING ---
            // Only fires if the user has explicitly opted in AND we haven't
            // already successfully pinged for this install. `None` (never
            // chosen) and `Some(false)` (declined) both skip the ping.
            // The `analytics_ping_sent` flag is persisted to config after a
            // successful send so subsequent launches don't bill another
            // serverless invocation for the same user.
            let app_handle_for_ping = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let cfg = match config::load(&app_handle_for_ping) {
                    Ok(c) => c,
                    Err(_) => return,
                };
                if cfg.telemetry_enabled != Some(true) || cfg.analytics_ping_sent {
                    return;
                }
                if let Ok(true) = telemetry::send_analytics_ping().await {
                    if let Err(e) = config::mark_analytics_ping_sent(&app_handle_for_ping) {
                        tracing::warn!("Failed to persist analytics_ping_sent flag: {}", e);
                    }
                }
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
            commands::lookup_layer_tile_info,
            commands::ensure_layer_tiles,
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
            commands::get_image_thumbnail,
            commands::get_app_usage_days,
            commands::duplicate_page,
            commands::get_all_broken_links,
            commands::get_all_broken_images,
            commands::get_all_parse_errors,
            commands::get_user_fonts,
            commands::install_user_font,
            commands::open_log_directory,
            commands::log_from_frontend,
            commands::get_telemetry_enabled,
            commands::set_telemetry_enabled,
        ])
        .run(tauri::generate_context!())
        .expect(r#"error while running tauri application"#);
}

/// Applies environment-variable workarounds for the WebKitGTK rendering
/// failures Linux users routinely report — white window on launch, "EGL bad
/// parameter" in the log, or a hung first frame on NVIDIA + Wayland.
///
/// Two vars cover the common cases:
///   * `WEBKIT_DISABLE_DMABUF_RENDERER=1` — WebKitGTK 2.42+'s DMA-BUF path
///     can't import buffers produced by the NVIDIA proprietary driver, which
///     surfaces as a blank WebView. Disabling it falls back to the GL-texture
///     upload path that works.
///   * `__NV_DISABLE_EXPLICIT_SYNC=1` — NVIDIA driver 555+ on Wayland has an
///     explicit-sync handshake with the compositor that frequently stalls the
///     first frame from WebKit. Forcing implicit sync avoids it.
///
/// Both are only set when the matching driver/session is detected and only
/// when the user hasn't already set them, so a future driver fix or a manual
/// override (e.g. `WEBKIT_DISABLE_DMABUF_RENDERER=0`) wins. The remaining
/// `LD_PRELOAD=/usr/lib/libwayland-client.so` workaround can't be applied
/// from here — `LD_PRELOAD` is read by the dynamic linker before `main`, so
/// it has to stay a documented FAQ entry.
#[cfg(target_os = "linux")]
fn apply_linux_compat_env() {
    use std::env;
    use std::path::Path;

    let is_nvidia = Path::new("/proc/driver/nvidia/version").exists()
        || Path::new("/sys/module/nvidia").exists();

    let is_wayland = env::var("XDG_SESSION_TYPE")
        .map(|v| v.eq_ignore_ascii_case("wayland"))
        .unwrap_or(false)
        || env::var_os("WAYLAND_DISPLAY").is_some();

    let mut applied: Vec<&'static str> = Vec::new();

    // SAFETY: this runs at the top of `main()` before any threads are
    // spawned, so the (non-thread-safe) POSIX setenv/getenv pair can't be
    // observed in a torn state by another thread.
    if is_nvidia {
        if env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            unsafe { env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
            applied.push("WEBKIT_DISABLE_DMABUF_RENDERER=1");
        }

        if is_wayland && env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none() {
            unsafe { env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1") };
            applied.push("__NV_DISABLE_EXPLICIT_SYNC=1");
        }
    }

    if !applied.is_empty() {
        // Tracing isn't initialised yet (it's set up inside `.setup()`), so
        // emit to stderr. Users debugging white-screen tickets are typically
        // told to launch from a terminal anyway.
        eprintln!(
            "Chronicler: detected NVIDIA={is_nvidia}, Wayland={is_wayland}; \
             applied compat workarounds: {}",
            applied.join(" ")
        );
    }
}

#[cfg(not(target_os = "linux"))]
fn apply_linux_compat_env() {}

/// Sets up the tracing subscriber for logging to both console and a rotating
/// file, and installs a panic hook that funnels Rust panics into the same
/// log so they survive in user bug reports (the default hook only prints to
/// stderr, which is invisible for users launching the bundled app).
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

    // Capture Rust panics into the rolling log.
    std::panic::set_hook(Box::new(|info| {
        let backtrace = std::backtrace::Backtrace::force_capture();
        tracing::error!("PANIC: {info}\nBacktrace:\n{backtrace}");
    }));

    Ok(())
}
