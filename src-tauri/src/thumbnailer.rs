//! Thumbnail cache for gallery tiles.
//!
//! Pre-generate a 240×240 cover-cropped thumbnail per image into
//! `.chronicler-cache/thumbnails/{cache_key}.{jpg|png}`. The gallery loads
//! these instead of the originals.
//!
//! Sources without an alpha channel are encoded as JPEG (small, fast).
//! Sources *with* alpha — screenshots, diagrams, transparent overlays —
//! are encoded as PNG so transparency survives the round trip. The file
//! extension records the choice so a single cache key can resolve to
//! either format on lookup.
//!
//! The cache key embeds source `len` + `mtime`, so any edit yields a
//! fresh filename. Stale files become orphans; we don't sweep them.
//! On decode failure callers should fall back to the original (see
//! `World::get_image_thumbnail`).

use crate::config::VAULT_CACHE_DIR_NAME;
use crate::error::{ChroniclerError, Result};
use crate::utils::compute_cache_key;
use crate::writer::atomic_write;
use image::{GenericImageView, ImageEncoder, ImageReader};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tokio::sync::Semaphore;
use tracing::{info, instrument};

/// Target edge length for generated thumbnails. 240 = 3× the 80px grid tile
/// so HiDPI displays stay sharp; a single size keeps the cache flat.
const THUMBNAIL_SIZE: u32 = 240;

/// JPEG quality. 80 = strong compression with no visible artifacts at 240×240.
const JPEG_QUALITY: u8 = 80;

/// Subdirectory for thumbnails inside the shared vault cache dir.
const THUMBNAILS_SUBDIR: &str = "thumbnails";

/// Global cap on concurrent thumbnail decodes.
///
/// The gallery fires one IPC call per visible tile, so a fresh open can
/// burst 50+ requests. Without a cap, tokio's blocking pool would
/// parallelize all of them, and each full-resolution decode of a 10 MP
/// source allocates ~100 MB of RGB pixels. 50 of those in flight will
/// OOM a modest machine and starve the UI thread of CPU.
///
/// We cap at half the cores (clamped to 2..=4): enough to hide per-image
/// I/O stalls, small enough that decode RAM stays bounded and the UI
/// thread always has cores to run on.
fn thumbnail_permits() -> &'static Semaphore {
    static PERMITS: OnceLock<Semaphore> = OnceLock::new();
    PERMITS.get_or_init(|| {
        let cores = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        Semaphore::new((cores / 2).clamp(2, 4))
    })
}

/// The extensionless cache path for this image. The encoder appends `.jpg`
/// or `.png` once the source's alpha channel is known.
fn cached_thumb_base(vault_path: &Path, image_path: &Path) -> PathBuf {
    let cache_key = compute_cache_key(image_path);
    vault_path
        .join(VAULT_CACHE_DIR_NAME)
        .join(THUMBNAILS_SUBDIR)
        .join(cache_key)
}

/// Returns the cached thumbnail path for this image if one exists in either
/// supported format. Checked before any decode work.
fn find_cached_thumb(vault_path: &Path, image_path: &Path) -> Option<PathBuf> {
    let base = cached_thumb_base(vault_path, image_path);
    ["jpg", "png"]
        .iter()
        .map(|ext| base.with_extension(ext))
        .find(|p| p.exists())
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Returns the path to a cached thumbnail, generating it if missing.
///
/// **Synchronous, CPU-bound.** Callers must invoke via
/// [`get_image_thumbnail_async`], which enforces both the blocking-pool
/// offload and the concurrency cap.
#[instrument(skip(vault_path), fields(image = %image_path.display()))]
fn get_image_thumbnail(vault_path: &Path, image_path: &Path) -> Result<PathBuf> {
    if let Some(cached) = find_cached_thumb(vault_path, image_path) {
        return Ok(cached);
    }

    let base = cached_thumb_base(vault_path, image_path);
    let cache_dir = base
        .parent()
        .expect("cached_thumb_base always joins two segments onto vault_path");
    fs::create_dir_all(cache_dir)?;

    info!("Generating thumbnail for {}", image_path.display());

    let img = ImageReader::open(image_path)
        .map_err(|e| ChroniclerError::ThumbnailGeneration(format!("Cannot open image: {e}")))?
        .decode()
        .map_err(|e| ChroniclerError::ThumbnailGeneration(format!("Cannot decode image: {e}")))?;

    let has_alpha = img.color().has_alpha();

    // Cover-crop to a square, clamped to the source size so tiny images
    // aren't upscaled (upscaling a 100×100 source to 240×240 would look
    // worse than displaying the original).
    let (src_w, src_h) = img.dimensions();
    let min_edge = src_w.min(src_h).max(1);
    let target = THUMBNAIL_SIZE.min(min_edge);

    let scale = target as f32 / min_edge as f32;
    // .max(target) guards against rounding that could otherwise leave a
    // resized dimension one pixel shy of the crop size.
    let new_w = ((src_w as f32 * scale).round() as u32).max(target);
    let new_h = ((src_h as f32 * scale).round() as u32).max(target);

    // `thumbnail_exact` is a fast integer box sampler - several times
    // quicker than `resize_exact(_, _, Triangle)` on full-res photos, and
    // visually indistinguishable at a 240px target.
    let resized = img.thumbnail_exact(new_w, new_h);
    drop(img); // release the full-res buffer before the encode/file I/O

    let crop_x = (new_w - target) / 2;
    let crop_y = (new_h - target) / 2;
    let square = resized.crop_imm(crop_x, crop_y, target, target);

    // Encode to JPEG if the source is opaque (smaller, faster), or PNG if
    // it has alpha (transparency would otherwise become black under JPEG).
    let (buf, ext) = if has_alpha {
        let rgba = square.to_rgba8();
        let mut buf = Vec::new();
        image::codecs::png::PngEncoder::new(&mut buf)
            .write_image(
                rgba.as_raw(),
                target,
                target,
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|e| ChroniclerError::ThumbnailGeneration(format!("PNG encode failed: {e}")))?;
        (buf, "png")
    } else {
        let rgb = square.to_rgb8();
        let mut buf = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, JPEG_QUALITY)
            .encode(rgb.as_raw(), target, target, image::ExtendedColorType::Rgb8)
            .map_err(|e| ChroniclerError::ThumbnailGeneration(format!("JPEG encode failed: {e}")))?;
        (buf, "jpg")
    };

    let thumb_path = base.with_extension(ext);
    atomic_write(&thumb_path, &buf)?;
    Ok(thumb_path)
}

/// Async wrapper around [`get_image_thumbnail`] for use in Tauri commands.
///
/// Responsibilities beyond `spawn_blocking`:
/// 1. Check the cache **before** acquiring a permit or a blocking thread,
///    so cache hits are near-free and don't queue behind in-flight decodes.
/// 2. Bound parallel decodes via a global semaphore — the gallery can
///    easily burst 50+ concurrent requests, and an unbounded blocking
///    pool will OOM on large source images.
/// 3. Re-check the cache after acquiring the permit; another request
///    for the same image may have generated it while we waited.
pub async fn get_image_thumbnail_async(
    vault_path: PathBuf,
    image_path: PathBuf,
) -> Result<PathBuf> {
    if let Some(cached) = find_cached_thumb(&vault_path, &image_path) {
        return Ok(cached);
    }

    let _permit = thumbnail_permits()
        .acquire()
        .await
        .map_err(|e| ChroniclerError::ThumbnailGeneration(format!("Semaphore closed: {e}")))?;

    if let Some(cached) = find_cached_thumb(&vault_path, &image_path) {
        return Ok(cached);
    }

    tokio::task::spawn_blocking(move || get_image_thumbnail(&vault_path, &image_path))
        .await
        .map_err(|e| ChroniclerError::ThumbnailGeneration(format!("Task join error: {e}")))?
}
