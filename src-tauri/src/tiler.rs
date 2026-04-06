//! Tile pyramid generator for map layer images.
//!
//! # The Problem
//!
//! Large map images (8K, 20+ MB) cause severe lag in Leaflet because the browser
//! must hold the entire decoded texture in GPU memory and re-composite it every
//! frame during pan/zoom.
//!
//! # The Solution
//!
//! Pre-slice each image into a **tile pyramid**: small 256×256 JPEG tiles at
//! multiple zoom levels. Leaflet loads only the tiles visible in the viewport.
//!
//! # How a Tile Pyramid Works
//!
//! At each zoom level the source image is downscaled by a factor of 2 and
//! sliced into 256×256 tiles. Higher zoom levels = more, smaller tiles
//! covering finer detail; lower zoom levels = fewer tiles for the overview.
//!
//! - **Zoom N (max)**: native resolution. Each tile maps 1:1 to a 256×256
//!   pixel region of the source image. For an 8640×5400 image: 34×22 tiles.
//! - **Zoom N-1**: image resized to half size, then sliced. Half as many tiles
//!   per axis (so a quarter of the total).
//! - **Zoom 0**: image resized to fit within a single 256×256 tile. For
//!   non-square images, the scaled image is smaller than 256 in one
//!   dimension and the tile is padded with black at the edges.
//!
//! `max_zoom = ceil(log2(max(width, height) / 256))`. For an 8640×5400 image
//! that's `ceil(log2(33.75)) = 6`, giving 7 zoom levels (0..6).
//!
//! # Edge Tiles and Padding
//!
//! Most images aren't exact multiples of 256 pixels. The image at each zoom
//! level is resized to its **exact proportional dimensions** (preserving
//! aspect ratio), then sliced into tiles. The right and bottom edge tiles
//! are partial — the available image content is placed in the top-left of
//! the 256×256 tile and the rest is filled with black padding. The frontend
//! is told the true image dimensions and clips display accordingly.
//!
//! # Performance
//!
//! Tile encoding is parallelized across CPU cores using rayon.
//! Bilinear filtering is used instead of Lanczos for large images
//! (5–10× faster, same visual quality at 256px).
//!
//! # Progress Events
//!
//! When an `AppHandle` is provided, the tiler emits `tile-progress` events
//! after each zoom level completes. The frontend subscribes to display a
//! progress bar. Payload:
//!
//! ```json
//! { "image": "world-map.png", "current": 3, "total": 6, "phase": "tiling" }
//! ```
//!
//! A `"phase": "loading"` event is emitted once before tiling begins (during
//! image decode), so the UI can show feedback immediately.
//!
//! # Async Wrapper
//!
//! `generate_tiles` is synchronous (CPU-bound). Tauri commands must not block
//! the async runtime or event delivery stalls. Use [`generate_tiles_async`]
//! for Tauri commands — it moves the work onto a blocking thread via
//! `tokio::task::spawn_blocking`, keeping the event loop free so progress
//! events actually reach the webview in real-time.
//!
//! # File Layout
//!
//! ```text
//! {vault}/.chronicler-cache/tiles/{image_hash}/
//!   .complete            ← marker (presence = tiles ready, contents = metadata)
//!   0/0_0.jpg            ← zoom 0 (overview, single tile)
//!   1/0_0.jpg            ← zoom 1
//!   1/1_0.jpg
//!   ...
//!   6/33_21.jpg          ← zoom 6 (native resolution for 8640×5400)
//! ```

use crate::error::{ChroniclerError, Result};
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageReader, Rgb, RgbImage};
use rayon::prelude::*;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tracing::{info, instrument};

/// Each tile is 256×256 pixels (the standard used by Leaflet, Google Maps, etc.)
const TILE_SIZE: u32 = 256;

/// JPEG quality. 85 = good balance. At 256×256 each tile is ~15–30 KB.
const JPEG_QUALITY: u8 = 85;

/// Hidden cache directory inside the vault.
/// Starts with `.` so the vault indexer skips it during file scanning.
const CACHE_DIR_NAME: &str = ".chronicler-cache";

/// Subdirectory for tile pyramids.
const TILES_SUBDIR: &str = "tiles";

/// Bilinear filter — much faster than Lanczos, visually identical at 256px tiles.
const DOWNSAMPLE_FILTER: FilterType = FilterType::Triangle;

/// Metadata returned to the frontend.
#[derive(Debug, Clone, serde::Serialize)]
pub struct TileSetInfo {
    /// Absolute path to the tile directory on disk.
    /// The frontend uses `convertFileSrc` to build asset URLs from this.
    pub tile_dir: String,
    /// The highest zoom level with tiles (native resolution).
    pub max_zoom: u32,
    /// Source image width in pixels.
    pub width: u32,
    /// Source image height in pixels.
    pub height: u32,
}

/// Payload emitted via `tile-progress` events.
#[derive(Debug, Clone, serde::Serialize)]
struct TileProgressPayload {
    /// Source image filename (for the frontend to match against layers).
    image: String,
    /// How many steps have completed so far.
    current: u32,
    /// Total number of steps (zoom levels).
    total: u32,
    /// Human-readable phase: "loading" during decode, "tiling" during slicing.
    phase: &'static str,
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/// Hash an image by path + file size + mtime (avoids reading the full file).
/// If the image is re-saved, the mtime changes → new hash → tiles regenerate.
fn compute_image_hash(path: &Path) -> String {
    let mut h = DefaultHasher::new();
    path.to_string_lossy().hash(&mut h);
    if let Ok(meta) = fs::metadata(path) {
        if let Ok(mtime) = meta.modified() {
            mtime.hash(&mut h);
        }
        meta.len().hash(&mut h);
    }
    format!("{:016x}", h.finish())
}

// ---------------------------------------------------------------------------
// Zoom math
// ---------------------------------------------------------------------------

/// Max zoom level: the smallest `z` where each tile covers ≤256 source pixels.
///
/// For 8192×6000: ceil(log2(8192 / 256)) = ceil(5.0) = 5.
fn calculate_max_zoom(width: u32, height: u32) -> u32 {
    let max_dim = width.max(height) as f64;
    (max_dim / TILE_SIZE as f64).log2().ceil() as u32
}

/// How many tiles along one axis at zoom `z`.
///
/// At max zoom each tile = 256px. At lower zooms each tile covers more pixels.
/// Example (8192px wide, max_zoom=5):
///   zoom 5 → 8192/256 = 32,  zoom 4 → 8192/512 = 16,  zoom 0 → 1
pub fn tiles_for_axis(axis_pixels: u32, z: u32, max_zoom: u32) -> u32 {
    let px_per_tile = TILE_SIZE as f64 * 2f64.powi((max_zoom as i32) - (z as i32));
    (axis_pixels as f64 / px_per_tile).ceil() as u32
}

// ---------------------------------------------------------------------------
// Progress helper
// ---------------------------------------------------------------------------

/// Emit a progress event if an AppHandle is available. Failures are silently
/// ignored — progress is advisory and must never block tile generation.
fn emit_progress(
    app_handle: Option<&AppHandle>,
    image_name: &str,
    current: u32,
    total: u32,
    phase: &'static str,
) {
    if let Some(handle) = app_handle {
        let _ = handle.emit(
            "tile-progress",
            TileProgressPayload {
                image: image_name.to_string(),
                current,
                total,
                phase,
            },
        );
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Generate tiles for an image, or return cached info if already done.
///
/// This is a **synchronous, CPU-bound** function. It is safe to call from
/// any thread, but do **not** call it directly from a Tauri `async` command
/// — it will block the async runtime and prevent event delivery.
/// Use [`generate_tiles_async`] for Tauri commands instead.
///
/// When `app_handle` is `Some`, progress events are emitted on the
/// `tile-progress` channel so the frontend can display a progress bar.
/// Pass `None` in tests or when no UI feedback is needed.
#[instrument(skip(vault_path, app_handle), fields(image = %image_path.display()))]
pub fn generate_tiles(
    vault_path: &Path,
    image_path: &Path,
    app_handle: Option<&AppHandle>,
) -> Result<TileSetInfo> {
    let hash = compute_image_hash(image_path);
    let tile_dir = vault_path
        .join(CACHE_DIR_NAME)
        .join(TILES_SUBDIR)
        .join(&hash);
    let marker = tile_dir.join(".complete");

    // Friendly name for progress events (just the filename, not the full path).
    let image_name = image_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    // ── Fast path: already cached ────────────────────────────────────────
    if marker.exists() {
        if let Some(info) = read_marker(&marker, &tile_dir) {
            info!("Tiles cached for {}", image_path.display());
            return Ok(info);
        }
    }

    // ── Load source image ────────────────────────────────────────────────
    info!("Generating tiles for {}", image_path.display());

    // Emit an immediate "loading" event so the UI shows feedback right away.
    emit_progress(app_handle, &image_name, 0, 1, "loading");

    let img = ImageReader::open(image_path)
        .map_err(|e| ChroniclerError::TileGeneration(format!("Cannot open image: {e}")))?
        .decode()
        .map_err(|e| ChroniclerError::TileGeneration(format!("Cannot decode image: {e}")))?;

    let (src_w, src_h) = img.dimensions();
    let max_zoom = calculate_max_zoom(src_w, src_h);
    let total_steps = max_zoom + 1; // one per zoom level

    info!(
        "Source: {}×{}, max_zoom: {}, levels: {}",
        src_w, src_h, max_zoom, total_steps
    );

    // ── Prepare output directory ─────────────────────────────────────────
    if tile_dir.exists() {
        fs::remove_dir_all(&tile_dir)?;
    }
    fs::create_dir_all(&tile_dir)?;

    // ── Build tile pyramid ─────────────────────────────────────────────
    //
    // For each zoom level, we resize the ORIGINAL source image to the exact
    // proportional dimensions for that level, then slice it into tiles.
    //
    // We resize from the original (not chain from the previous level) to
    // avoid cumulative quality loss from repeated resampling. This is more
    // CPU work than chaining, but the larger zoom levels use bilinear
    // filtering (fast) and only the smaller thumbnail levels use the
    // higher-quality Lanczos3 filter, so the total cost is reasonable.

    let mut completed: u32 = 0;

    for z in (0..=max_zoom).rev() {
        let cols = tiles_for_axis(src_w, z, max_zoom);
        let rows = tiles_for_axis(src_h, z, max_zoom);

        // Exact proportional dimensions at this zoom level. The resized
        // image preserves the source aspect ratio — edge tiles may be
        // partially padded with black by `slice_tiles_parallel`.
        let scale_factor = 2f64.powi((max_zoom as i32) - (z as i32));
        let exact_w = (src_w as f64 / scale_factor).round() as u32;
        let exact_h = (src_h as f64 / scale_factor).round() as u32;

        let working = if z == max_zoom {
            // Max zoom = native resolution — no resize needed.
            img.clone()
        } else {
            // Lanczos3 is sharper but slow on large images. Use it only for
            // small thumbnail levels (≤ 2048 px on either axis); use bilinear
            // (Triangle) for larger levels where the quality difference is
            // imperceptible at 256px tile sizes but the speedup is significant.
            let filter = if exact_w <= 2048 && exact_h <= 2048 {
                FilterType::Lanczos3
            } else {
                DOWNSAMPLE_FILTER
            };
            // .max(1) guards against degenerate dimensions for tiny images.
            img.resize_exact(exact_w.max(1), exact_h.max(1), filter)
        };

        // Slice the resized image into tiles (parallel JPEG encoding via rayon).
        slice_tiles_parallel(&working, cols, rows, z, &tile_dir)?;

        completed += 1;
        emit_progress(app_handle, &image_name, completed, total_steps, "tiling");
    }

    // ── Write completion marker ──────────────────────────────────────────
    fs::write(&marker, format!("{},{},{}", max_zoom, src_w, src_h))?;
    info!("Tile generation complete for {}", image_path.display());

    // Normalize path separators to forward slashes for the frontend
    let tile_dir_str = tile_dir.to_string_lossy().replace('\\', "/");

    Ok(TileSetInfo {
        tile_dir: tile_dir_str,
        max_zoom,
        width: src_w,
        height: src_h,
    })
}

/// Async wrapper around [`generate_tiles`] for use in Tauri commands.
///
/// Moves the CPU-bound tile generation onto a **blocking thread** via
/// `tokio::task::spawn_blocking`. This is the critical piece that was
/// missing before: without it, `generate_tiles` runs directly on the
/// Tauri async runtime thread, which means:
///
///   1. `emit()` calls are queued but the runtime can't flush them to the
///      webview because the thread is busy doing image work.
///   2. The frontend appears frozen — no progress events arrive until
///      *after* tile generation completes (all at once, defeating the purpose).
///   3. Other Tauri IPC commands are also blocked.
///
/// `spawn_blocking` solves all three: the heavy work runs on a dedicated
/// OS thread from tokio's blocking pool, while the async runtime stays
/// free to deliver events and service other commands.
///
/// # Usage in a Tauri command
///
/// ```rust,ignore
/// #[tauri::command]
/// pub async fn ensure_layer_tiles(
///     app_handle: AppHandle,
///     image_filename: String,
/// ) -> Result<TileSetInfo> {
///     let vault_path = /* resolve vault path */;
///     let image_path = /* resolve image path */;
///     generate_tiles_async(vault_path, image_path, app_handle).await
/// }
/// ```
pub async fn generate_tiles_async(
    vault_path: PathBuf,
    image_path: PathBuf,
    app_handle: AppHandle,
) -> Result<TileSetInfo> {
    tokio::task::spawn_blocking(move || generate_tiles(&vault_path, &image_path, Some(&app_handle)))
        .await
        .map_err(|e| ChroniclerError::TileGeneration(format!("Task join error: {e}")))?
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

fn read_marker(marker: &Path, tile_dir: &Path) -> Option<TileSetInfo> {
    let text = fs::read_to_string(marker).ok()?;
    let p: Vec<&str> = text.split(',').collect();
    if p.len() != 3 {
        return None;
    }
    let tile_dir_str = tile_dir.to_string_lossy().replace('\\', "/");
    Some(TileSetInfo {
        tile_dir: tile_dir_str,
        max_zoom: p[0].parse().ok()?,
        width: p[1].parse().ok()?,
        height: p[2].parse().ok()?,
    })
}

/// Slices a pre-scaled image into tiles using rayon for parallel JPEG encoding.
///
/// Each tile is an independent unit of work: crop 256×256 pixels, convert to
/// RGB, encode as JPEG, write to disk. These are CPU-bound and embarrassingly
/// parallel — rayon splits them across all available CPU cores.
fn slice_tiles_parallel(
    working: &DynamicImage,
    cols: u32,
    rows: u32,
    z: u32,
    tile_dir: &Path,
) -> Result<()> {
    let zoom_dir = tile_dir.join(z.to_string());
    fs::create_dir_all(&zoom_dir)?;

    let (img_w, img_h) = working.dimensions();

    // Build a list of (col, row) coordinates for all tiles at this zoom.
    let coords: Vec<(u32, u32)> = (0..cols)
        .flat_map(|tx| (0..rows).map(move |ty| (tx, ty)))
        .collect();

    // Process tiles in parallel.
    // We pre-crop all tiles from the shared `working` image (read-only),
    // then encode and write each one independently.
    coords.par_iter().try_for_each(|&(tx, ty)| -> Result<()> {
        let crop_x = tx * TILE_SIZE;
        let crop_y = ty * TILE_SIZE;

        // How many pixels are actually available at this position.
        // At image edges this may be less than TILE_SIZE.
        let avail_w = TILE_SIZE.min(img_w.saturating_sub(crop_x));
        let avail_h = TILE_SIZE.min(img_h.saturating_sub(crop_y));

        let tile: RgbImage = if avail_w == TILE_SIZE && avail_h == TILE_SIZE {
            // Full tile — crop and convert to RGB (the common case).
            working
                .crop_imm(crop_x, crop_y, TILE_SIZE, TILE_SIZE)
                .to_rgb8()
        } else if avail_w == 0 || avail_h == 0 {
            // Completely outside image bounds — solid black tile.
            RgbImage::from_pixel(TILE_SIZE, TILE_SIZE, Rgb([34, 34, 34]))
        } else {
            // Partial edge tile — crop what exists, pad rest with black.
            let partial = working.crop_imm(crop_x, crop_y, avail_w, avail_h).to_rgb8();
            let mut padded = RgbImage::from_pixel(TILE_SIZE, TILE_SIZE, Rgb([34, 34, 34]));
            image::imageops::overlay(&mut padded, &partial, 0, 0);
            padded
        };

        // Encode to JPEG and write to disk.
        let path = zoom_dir.join(format!("{}_{}.jpg", tx, ty));
        let mut out = BufWriter::new(fs::File::create(&path).map_err(|e| {
            ChroniclerError::TileGeneration(format!("Cannot create {}: {e}", path.display()))
        })?);
        let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY);
        enc.encode(
            tile.as_raw(),
            TILE_SIZE,
            TILE_SIZE,
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| {
            ChroniclerError::TileGeneration(format!("JPEG encode failed z={z} x={tx} y={ty}: {e}"))
        })?;

        Ok(())
    })?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_max_zoom() {
        assert_eq!(calculate_max_zoom(256, 256), 0);
        assert_eq!(calculate_max_zoom(512, 512), 1);
        assert_eq!(calculate_max_zoom(1024, 1024), 2);
        assert_eq!(calculate_max_zoom(8192, 6000), 5);
        assert_eq!(calculate_max_zoom(4096, 256), 4);
    }

    #[test]
    fn test_tiles_for_axis() {
        assert_eq!(tiles_for_axis(8192, 5, 5), 32);
        assert_eq!(tiles_for_axis(6000, 5, 5), 24);
        assert_eq!(tiles_for_axis(8192, 4, 5), 16);
        assert_eq!(tiles_for_axis(6000, 4, 5), 12);
        assert_eq!(tiles_for_axis(8192, 0, 5), 1);
        assert_eq!(tiles_for_axis(6000, 0, 5), 1);
    }

    #[test]
    fn test_hash_stability() {
        let p = Path::new("/some/test/image.png");
        assert_eq!(compute_image_hash(p), compute_image_hash(p));
    }
}
