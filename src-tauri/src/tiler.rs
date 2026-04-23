//! Tile pyramid generator for map layer images.
//!
//! Full-resolution map images (8K+, 20+ MB) lag Leaflet because the browser
//! holds the whole decoded texture in GPU memory and re-composites every
//! frame. Instead we pre-slice each source into 512×512 tiles at multiple
//! zoom levels - Leaflet only loads what's in the viewport.
//!
//! 512px (rather than the older 256px web-map default) is a deliberate
//! choice: on Tauri/Linux every tile is one asset-protocol IPC round-trip,
//! and 512px tiles cut request count 4× for the same viewport coverage.
//! Mapbox/ESRI ship 512px by default for the same reason.
//!
//! `max_zoom = ceil(log2(max(width, height) / 256))`; lower zooms are
//! proportionally-resized copies sliced the same way. Edge tiles are
//! partial: the available content goes in the top-left and the rest is
//! padded out. The frontend is given the true source dimensions and
//! clips accordingly.
//!
//! # Tile format
//!
//! Sources without an alpha channel are encoded as JPEG (small, fast).
//! Sources *with* alpha — typical for overlay layers stacked on a base map
//! — are encoded as PNG so transparency survives the round trip. Edge tile
//! padding is opaque dark grey for JPEG and fully transparent for PNG.
//!
//! # Atomicity
//!
//! Tiles aren't atomically written individually; the `.complete` marker is
//! written *last* and gates the cache. A crash mid-generation leaves a
//! markerless directory which the next call wipes and regenerates.
//!
//! # File layout
//!
//! ```text
//! {vault}/.chronicler-cache/tiles/{cache_key}/
//!   .complete            ← marker; contents = "max_zoom,w,h,ext"
//!   {z}/{x}_{y}.{ext}    ← one file per tile (ext = "jpg" or "png")
//! ```

use crate::config::VAULT_CACHE_DIR_NAME;
use crate::error::{ChroniclerError, Result};
use crate::utils::compute_cache_key;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageReader, Rgb, RgbImage, Rgba, RgbaImage};
use rayon::prelude::*;
use std::fs;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tracing::{info, instrument};

/// Each tile is 512×512 pixels. **Must stay in sync with `TILE_SIZE` in
/// `MapView.svelte`** — the frontend hardcodes the same value when computing
/// max zoom and configuring `L.GridLayer`'s `tileSize` option.
const TILE_SIZE: u32 = 512;

/// JPEG quality. 85 = good balance. At 512×512 each tile is ~50–100 KB.
const JPEG_QUALITY: u8 = 85;

/// Subdirectory for tile pyramids inside the shared vault cache dir.
const TILES_SUBDIR: &str = "tiles";

/// Tile encoding format. Determined per source from its color type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TileFormat {
    Jpeg,
    Png,
}

impl TileFormat {
    fn ext(self) -> &'static str {
        match self {
            TileFormat::Jpeg => "jpg",
            TileFormat::Png => "png",
        }
    }

    fn parse(s: &str) -> Option<Self> {
        match s {
            "jpg" => Some(TileFormat::Jpeg),
            "png" => Some(TileFormat::Png),
            _ => None,
        }
    }
}

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
    /// Tile file extension — `"jpg"` for opaque sources, `"png"` for sources
    /// with an alpha channel. The frontend uses this when building tile URLs.
    pub tile_ext: String,
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
// Zoom math
// ---------------------------------------------------------------------------

/// Max zoom level: the smallest `z` where each tile covers ≤TILE_SIZE source pixels.
///
/// For 8192×6000 with TILE_SIZE=512: ceil(log2(8192 / 512)) = ceil(4.0) = 4.
fn calculate_max_zoom(width: u32, height: u32) -> u32 {
    let max_dim = width.max(height) as f64;
    (max_dim / TILE_SIZE as f64).log2().ceil() as u32
}

/// How many tiles along one axis at zoom `z`.
///
/// At max zoom each tile = TILE_SIZE px. At lower zooms each tile covers more pixels.
/// Example (8192px wide, TILE_SIZE=512, max_zoom=4):
///   zoom 4 → 8192/512 = 16,  zoom 3 → 8192/1024 = 8,  zoom 0 → 1
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
/// - it will block the async runtime and prevent event delivery.
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
    let cache_key = compute_cache_key(image_path);
    let tile_dir = vault_path
        .join(VAULT_CACHE_DIR_NAME)
        .join(TILES_SUBDIR)
        .join(&cache_key);
    let marker = tile_dir.join(".complete");

    // Friendly name for progress events (just the filename, not the full path).
    let image_name = image_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    // ── Fast path: already cached ────────────────────────────────────────
    if let Some(info) = lookup_tile_info(vault_path, image_path) {
        info!("Tiles cached for {}", image_path.display());
        return Ok(info);
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

    // Pick tile encoding based on whether the source has alpha. Overlay
    // layers (semi-transparent biome maps, political borders, etc.) are
    // useless without their alpha channel; opaque base maps stay on JPEG to
    // keep cache sizes down.
    let format = if img.color().has_alpha() {
        TileFormat::Png
    } else {
        TileFormat::Jpeg
    };

    info!(
        "Source: {}×{}, max_zoom: {}, levels: {}, format: {}",
        src_w,
        src_h,
        max_zoom,
        total_steps,
        format.ext()
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

        // At max zoom we slice the source directly; lower zooms get a
        // proportionally-resized copy. Lanczos3 is sharper but slow on large
        // images, so use it only when both axes fit ≤ 2048 px (≈ small
        // thumbnail levels); larger levels fall back to bilinear, where the
        // quality difference is imperceptible at 256px tiles.
        if z == max_zoom {
            slice_tiles_parallel(&img, cols, rows, z, &tile_dir, format)?;
        } else {
            let filter = if exact_w <= 2048 && exact_h <= 2048 {
                FilterType::Lanczos3
            } else {
                FilterType::Triangle
            };
            // .max(1) guards against degenerate dimensions for tiny images.
            let working = img.resize_exact(exact_w.max(1), exact_h.max(1), filter);
            slice_tiles_parallel(&working, cols, rows, z, &tile_dir, format)?;
        }

        completed += 1;
        emit_progress(app_handle, &image_name, completed, total_steps, "tiling");
    }

    // ── Write completion marker ──────────────────────────────────────────
    fs::write(
        &marker,
        format!("{},{},{},{}", max_zoom, src_w, src_h, format.ext()),
    )?;
    info!("Tile generation complete for {}", image_path.display());

    // Normalize path separators to forward slashes for the frontend
    let tile_dir_str = tile_dir.to_string_lossy().replace('\\', "/");

    Ok(TileSetInfo {
        tile_dir: tile_dir_str,
        max_zoom,
        width: src_w,
        height: src_h,
        tile_ext: format.ext().to_string(),
    })
}

/// Returns cached tile info for `image_path` if a complete pyramid is on
/// disk, otherwise `None`. Pure read — never decodes or generates.
///
/// The frontend uses this to decide whether to mount the tiled `GridLayer`
/// straight away or fall back to the full-resolution image while async
/// generation runs. Without this fast path, every cold map open mounts the
/// fallback even when tiles are already cached.
pub fn lookup_tile_info(vault_path: &Path, image_path: &Path) -> Option<TileSetInfo> {
    let cache_key = compute_cache_key(image_path);
    let tile_dir = vault_path
        .join(VAULT_CACHE_DIR_NAME)
        .join(TILES_SUBDIR)
        .join(&cache_key);
    let marker = tile_dir.join(".complete");
    if !marker.exists() {
        return None;
    }
    read_marker(&marker, &tile_dir)
}

/// Async wrapper around [`generate_tiles`] for Tauri commands.
///
/// Offloads the CPU-bound work via `spawn_blocking` so the async runtime
/// stays free to flush `tile-progress` events and service other IPC. Without
/// this, progress events are queued but only delivered after generation
/// finishes — defeating the point of a progress bar.
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
    // Pre-alpha caches wrote 3 fields and always served JPEG, including for
    // sources with an alpha channel — losing transparency. Treating them as
    // stale (refusing to read 3-field markers) forces a one-time regen so
    // any previously-tiled overlay layer recovers its alpha.
    if p.len() != 4 {
        return None;
    }
    let max_zoom: u32 = p[0].parse().ok()?;
    let width: u32 = p[1].parse().ok()?;
    let height: u32 = p[2].parse().ok()?;
    let format = TileFormat::parse(p[3])?;

    // Sanity check: the overview tile (z=0, 0_0.{ext}) is always present in
    // a healthy pyramid. If it's missing, the cache has been partially
    // deleted (sync conflict, manual cleanup, etc.) and we should regenerate
    // rather than serve broken tiles forever.
    let overview = tile_dir
        .join("0")
        .join(format!("0_0.{}", format.ext()));
    if !overview.exists() {
        info!(
            "Tile cache marker present but overview tile missing at {}; regenerating",
            overview.display()
        );
        return None;
    }

    let tile_dir_str = tile_dir.to_string_lossy().replace('\\', "/");
    Some(TileSetInfo {
        tile_dir: tile_dir_str,
        max_zoom,
        width,
        height,
        tile_ext: format.ext().to_string(),
    })
}

/// Slices a pre-scaled image into tiles using rayon for parallel encoding.
///
/// Each tile is an independent unit of work: crop 256×256 pixels, encode,
/// write to disk. These are CPU-bound and embarrassingly parallel — rayon
/// splits them across all available CPU cores.
///
/// `format` controls the encoder. JPEG drops alpha and pads partial edge
/// tiles with opaque dark grey; PNG keeps alpha and pads with fully
/// transparent pixels so overlay layers composite correctly.
fn slice_tiles_parallel(
    working: &DynamicImage,
    cols: u32,
    rows: u32,
    z: u32,
    tile_dir: &Path,
    format: TileFormat,
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

        // How many pixels are actually available at this position. cols/rows
        // are sized so crop_x < img_w and crop_y < img_h always hold, so
        // avail_w/avail_h are in 1..=TILE_SIZE.
        let avail_w = TILE_SIZE.min(img_w - crop_x);
        let avail_h = TILE_SIZE.min(img_h - crop_y);

        let path = zoom_dir.join(format!("{}_{}.{}", tx, ty, format.ext()));
        let out = BufWriter::new(fs::File::create(&path).map_err(|e| {
            ChroniclerError::TileGeneration(format!("Cannot create {}: {e}", path.display()))
        })?);

        match format {
            TileFormat::Jpeg => {
                let tile: RgbImage = if avail_w == TILE_SIZE && avail_h == TILE_SIZE {
                    working
                        .crop_imm(crop_x, crop_y, TILE_SIZE, TILE_SIZE)
                        .to_rgb8()
                } else {
                    let partial = working
                        .crop_imm(crop_x, crop_y, avail_w, avail_h)
                        .to_rgb8();
                    let mut padded =
                        RgbImage::from_pixel(TILE_SIZE, TILE_SIZE, Rgb([34, 34, 34]));
                    image::imageops::overlay(&mut padded, &partial, 0, 0);
                    padded
                };

                let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(out, JPEG_QUALITY);
                enc.encode(
                    tile.as_raw(),
                    TILE_SIZE,
                    TILE_SIZE,
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|e| {
                    ChroniclerError::TileGeneration(format!(
                        "JPEG encode failed z={z} x={tx} y={ty}: {e}"
                    ))
                })?;
            }
            TileFormat::Png => {
                let tile: RgbaImage = if avail_w == TILE_SIZE && avail_h == TILE_SIZE {
                    working
                        .crop_imm(crop_x, crop_y, TILE_SIZE, TILE_SIZE)
                        .to_rgba8()
                } else {
                    // Pad with fully transparent pixels — keeps the
                    // overlay's edge clean against whatever is below.
                    let partial = working
                        .crop_imm(crop_x, crop_y, avail_w, avail_h)
                        .to_rgba8();
                    let mut padded =
                        RgbaImage::from_pixel(TILE_SIZE, TILE_SIZE, Rgba([0, 0, 0, 0]));
                    image::imageops::overlay(&mut padded, &partial, 0, 0);
                    padded
                };

                let enc = image::codecs::png::PngEncoder::new(out);
                use image::ImageEncoder;
                enc.write_image(
                    tile.as_raw(),
                    TILE_SIZE,
                    TILE_SIZE,
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(|e| {
                    ChroniclerError::TileGeneration(format!(
                        "PNG encode failed z={z} x={tx} y={ty}: {e}"
                    ))
                })?;
            }
        }

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
        // With TILE_SIZE=512:
        assert_eq!(calculate_max_zoom(512, 512), 0);
        assert_eq!(calculate_max_zoom(1024, 1024), 1);
        assert_eq!(calculate_max_zoom(2048, 2048), 2);
        assert_eq!(calculate_max_zoom(8192, 6000), 4);
        assert_eq!(calculate_max_zoom(4096, 512), 3);
    }

    #[test]
    fn test_tiles_for_axis() {
        // With TILE_SIZE=512:
        assert_eq!(tiles_for_axis(8192, 4, 4), 16);
        assert_eq!(tiles_for_axis(6000, 4, 4), 12);
        assert_eq!(tiles_for_axis(8192, 3, 4), 8);
        assert_eq!(tiles_for_axis(6000, 3, 4), 6);
        assert_eq!(tiles_for_axis(8192, 0, 4), 1);
        assert_eq!(tiles_for_axis(6000, 0, 4), 1);
    }
}
