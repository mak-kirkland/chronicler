//! Importing images into a directory inside the vault (configurable; defaults to
//! `images`, or the page's own folder in "adjacent" mode).
//!
//! Backs the editor's image paste and "Insert image" button: it sanitizes the
//! filename and target directory, enforces a size and type limit, de-duplicates
//! by content, and writes atomically.

use std::fs;
use std::path::{Path, PathBuf};

use percent_encoding::percent_decode_str;

use crate::error::{ChroniclerError, Result};
use crate::models::ImportedImage;

const MAX_IMAGE_BYTES: usize = 25 * 1024 * 1024;
const ALLOWED_IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];

/// Whether `ext` (without the leading dot, any case) names an image type we accept.
fn is_allowed_ext(ext: &str) -> bool {
    ALLOWED_IMAGE_EXTS.contains(&ext.to_ascii_lowercase().as_str())
}

/// Reduce a caller-supplied name to a safe basename with an allowed image
/// extension. Strips directory components (path-traversal guard) and replaces
/// characters that are awkward on common filesystems.
fn sanitize_image_filename(suggested: &str) -> Result<String> {
    let base = suggested
        .rsplit(|c| c == '/' || c == '\\')
        .next()
        .unwrap_or("")
        .trim();

    let dot = base
        .rfind('.')
        .ok_or_else(|| ChroniclerError::ImageImport("Image has no file extension".into()))?;
    let (stem, ext_with_dot) = base.split_at(dot);
    let ext = ext_with_dot[1..].to_ascii_lowercase();
    let stem = stem.trim();

    if stem.is_empty() {
        return Err(ChroniclerError::ImageImport("Image has no usable name".into()));
    }
    if !is_allowed_ext(&ext) {
        return Err(ChroniclerError::ImageImport(format!(
            "Unsupported image type: .{ext}"
        )));
    }

    let safe_stem: String = stem
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ' ') {
                c
            } else {
                '-'
            }
        })
        .collect();

    Ok(format!("{safe_stem}.{ext}"))
}

fn split_stem_ext(name: &str) -> (String, String) {
    match name.rfind('.') {
        Some(dot) => (name[..dot].to_string(), name[dot + 1..].to_string()),
        None => (name.to_string(), String::new()),
    }
}

/// Whether `path` can hold `bytes`: `Some(false)` if it's free, `Some(true)` if
/// it already holds byte-identical content (so it can be reused without writing),
/// or `None` if it's occupied by different content. The length check avoids
/// reading the whole file back when the sizes can't possibly match.
fn reuse_status(path: &Path, bytes: &[u8]) -> Result<Option<bool>> {
    if !path.exists() {
        return Ok(Some(false));
    }
    if fs::metadata(path)?.len() == bytes.len() as u64 && fs::read(path)? == bytes {
        return Ok(Some(true));
    }
    Ok(None)
}

/// Pick the on-disk name for `bytes` and whether an existing file is reused: use
/// `name` if it's free or already byte-identical, otherwise try `<stem>-2.<ext>`,
/// `<stem>-3.<ext>`, … applying the same rule.
fn resolve_target_name(images_dir: &Path, name: &str, bytes: &[u8]) -> Result<(String, bool)> {
    if let Some(reused) = reuse_status(&images_dir.join(name), bytes)? {
        return Ok((name.to_string(), reused));
    }

    let (stem, ext) = split_stem_ext(name);
    let mut n = 2u32;
    loop {
        let next = format!("{stem}-{n}.{ext}");
        if let Some(reused) = reuse_status(&images_dir.join(&next), bytes)? {
            return Ok((next, reused));
        }
        n += 1;
    }
}

/// Reduce a caller-supplied vault-relative directory to a safe normalized form:
/// split on either separator, drop empty/`.`/`..` components (path-traversal
/// guard), and rejoin with `/`. An empty result means the vault root itself.
fn sanitize_subdir(dir: &str) -> String {
    dir.split(['/', '\\'])
        .filter(|c| !c.is_empty() && *c != "." && *c != "..")
        .collect::<Vec<_>>()
        .join("/")
}

/// Copy `bytes` into `dir` (a vault-relative directory; empty means the vault
/// root), returning the resulting reference. The directory is created if missing.
/// An identically-named file with identical content is reused (no write); a name
/// clash with different content gets a numeric suffix.
pub fn write_image_into_vault(
    vault_root: &Path,
    bytes: &[u8],
    suggested_filename: &str,
    dir: &str,
) -> Result<ImportedImage> {
    if bytes.is_empty() {
        return Err(ChroniclerError::ImageImport("Image is empty".into()));
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(ChroniclerError::ImageImport(format!(
            "Image is too large ({:.1} MB); the limit is 25 MB",
            bytes.len() as f64 / (1024.0 * 1024.0)
        )));
    }

    let safe_name = sanitize_image_filename(suggested_filename)?;
    let safe_dir = sanitize_subdir(dir);
    // Joining an empty `safe_dir` leaves `vault_root` itself (the root case).
    let images_dir = vault_root.join(&safe_dir);
    fs::create_dir_all(&images_dir)?;

    let (final_name, reused) = resolve_target_name(&images_dir, &safe_name, bytes)?;
    if !reused {
        crate::writer::atomic_write(&images_dir.join(&final_name), bytes)?;
    }

    let relative_path = if safe_dir.is_empty() {
        final_name.clone()
    } else {
        format!("{safe_dir}/{final_name}")
    };
    Ok(ImportedImage {
        relative_path,
        filename: final_name,
        reused,
    })
}

/// Encode raw 8-bit RGBA pixels (row-major) into PNG bytes. Turns the decoded
/// image the OS clipboard hands back into a file we can store.
pub fn encode_rgba_png(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>> {
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|px| px.checked_mul(4));
    if rgba.is_empty() || expected != Some(rgba.len()) {
        return Err(ChroniclerError::ImageImport(
            "Clipboard image has no usable pixel data".into(),
        ));
    }

    let buffer = image::RgbaImage::from_raw(width, height, rgba.to_vec()).ok_or_else(|| {
        ChroniclerError::ImageImport("Clipboard image has no usable pixel data".into())
    })?;
    let mut png = Vec::new();
    buffer
        .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .map_err(|e| ChroniclerError::ImageImport(format!("Failed to encode image: {e}")))?;
    Ok(png)
}

/// Whether `path`'s extension is one we accept as an image.
fn is_allowed_image_path(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(is_allowed_ext)
}

/// Turn one clipboard line into a local path: a `file://` URI is stripped of its
/// scheme/host and percent-decoded (e.g. `%20` → space); anything else is
/// treated as a plain path.
fn line_to_local_path(line: &str) -> PathBuf {
    match line.strip_prefix("file://") {
        // `file:///path` leaves a leading `/`; a non-empty host (e.g.
        // `file://host/path`) won't exist locally and is dropped by the caller.
        Some(rest) => PathBuf::from(percent_decode_str(rest).decode_utf8_lossy().into_owned()),
        None => PathBuf::from(line),
    }
}

/// Parse clipboard text into the local image files it points to. File managers
/// put a newline-separated `file://` URI list (or plain paths) on the clipboard
/// when you copy a file; this keeps only entries that exist and look like images,
/// so ordinary copied text yields an empty list and the caller can fall back to
/// a normal text paste.
pub fn image_paths_from_clipboard_text(text: &str) -> Vec<PathBuf> {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(line_to_local_path)
        .filter(|path| is_allowed_image_path(path) && path.is_file())
        .collect()
}

/// Read an image file from disk and import it into `dir`. `name_override`, when
/// given, replaces the source filename (used by the picker's "prompt for name"
/// flow); otherwise the source's own filename is kept.
pub fn import_image_from_path(
    vault_root: &Path,
    source: &Path,
    dir: &str,
    name_override: Option<&str>,
) -> Result<ImportedImage> {
    let suggested = match name_override {
        Some(name) => name,
        None => source
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| ChroniclerError::ImageImport("Invalid source path".into()))?,
    };
    let bytes = fs::read(source)?;
    write_image_into_vault(vault_root, &bytes, suggested, dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn writes_new_image() {
        let dir = tempdir().unwrap();
        let out = write_image_into_vault(dir.path(), b"PNGDATA", "diagram.png", "images").unwrap();
        assert_eq!(out.filename, "diagram.png");
        assert_eq!(out.relative_path, "images/diagram.png");
        assert!(!out.reused);
        assert_eq!(
            fs::read(dir.path().join("images/diagram.png")).unwrap(),
            b"PNGDATA"
        );
    }

    #[test]
    fn writes_into_custom_and_nested_dirs() {
        let dir = tempdir().unwrap();
        let out = write_image_into_vault(dir.path(), b"X", "a.png", "art/refs").unwrap();
        assert_eq!(out.relative_path, "art/refs/a.png");
        assert!(dir.path().join("art/refs/a.png").exists());
    }

    #[test]
    fn empty_dir_writes_to_vault_root() {
        let dir = tempdir().unwrap();
        let out = write_image_into_vault(dir.path(), b"X", "a.png", "").unwrap();
        assert_eq!(out.relative_path, "a.png");
        assert!(dir.path().join("a.png").exists());
    }

    #[test]
    fn sanitizes_dir_path_traversal() {
        let dir = tempdir().unwrap();
        let out = write_image_into_vault(dir.path(), b"X", "a.png", "../../etc").unwrap();
        // The `..` components are stripped, keeping the write inside the vault.
        assert_eq!(out.relative_path, "etc/a.png");
        assert!(dir.path().join("etc/a.png").exists());
        assert!(!dir.path().parent().unwrap().join("etc/a.png").exists());
    }

    #[test]
    fn reuses_identical_existing_file() {
        let dir = tempdir().unwrap();
        write_image_into_vault(dir.path(), b"SAME", "pic.png", "images").unwrap();
        let out = write_image_into_vault(dir.path(), b"SAME", "pic.png", "images").unwrap();
        assert_eq!(out.filename, "pic.png");
        assert!(out.reused);
        assert!(!dir.path().join("images/pic-2.png").exists());
    }

    #[test]
    fn suffixes_on_clash_with_different_content() {
        let dir = tempdir().unwrap();
        write_image_into_vault(dir.path(), b"FIRST", "pic.png", "images").unwrap();
        let out = write_image_into_vault(dir.path(), b"SECOND", "pic.png", "images").unwrap();
        assert_eq!(out.filename, "pic-2.png");
        assert!(!out.reused);
        assert_eq!(fs::read(dir.path().join("images/pic.png")).unwrap(), b"FIRST");
        assert_eq!(
            fs::read(dir.path().join("images/pic-2.png")).unwrap(),
            b"SECOND"
        );
    }

    #[test]
    fn sanitizes_path_traversal() {
        let dir = tempdir().unwrap();
        let out = write_image_into_vault(dir.path(), b"X", "../../evil.png", "images").unwrap();
        assert_eq!(out.filename, "evil.png");
        assert!(dir.path().join("images/evil.png").exists());
        assert!(!dir.path().parent().unwrap().join("evil.png").exists());
    }

    #[test]
    fn rejects_non_image_extension() {
        let dir = tempdir().unwrap();
        assert!(write_image_into_vault(dir.path(), b"X", "notes.txt", "images").is_err());
    }

    #[test]
    fn rejects_empty_and_oversize() {
        let dir = tempdir().unwrap();
        assert!(write_image_into_vault(dir.path(), b"", "a.png", "images").is_err());
        let big = vec![0u8; MAX_IMAGE_BYTES + 1];
        assert!(write_image_into_vault(dir.path(), &big, "a.png", "images").is_err());
    }

    #[test]
    fn encodes_rgba_to_png() {
        // A 1x1 opaque red pixel.
        let png = encode_rgba_png(1, 1, &[255, 0, 0, 255]).unwrap();
        // PNG magic number.
        assert_eq!(&png[..8], &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
    }

    #[test]
    fn rejects_rgba_with_wrong_length() {
        // 2x2 needs 16 bytes; fewer provided.
        assert!(encode_rgba_png(2, 2, &[0, 0, 0, 255]).is_err());
        assert!(encode_rgba_png(1, 1, &[]).is_err());
    }

    #[test]
    fn extracts_image_files_from_clipboard_text() {
        let dir = tempdir().unwrap();
        let img = dir.path().join("a copy.png");
        fs::write(&img, b"PNG").unwrap();
        let txt = dir.path().join("notes.txt");
        fs::write(&txt, b"hi").unwrap();

        // A `file://` URI with an escaped space resolves to the real file.
        let uri = format!("file://{}", img.to_string_lossy().replace(' ', "%20"));
        assert_eq!(image_paths_from_clipboard_text(&uri), vec![img.clone()]);

        // A plain path also works.
        assert_eq!(
            image_paths_from_clipboard_text(&img.to_string_lossy()),
            vec![img.clone()]
        );

        // Non-image files, missing files, and ordinary text are ignored.
        assert!(image_paths_from_clipboard_text(&txt.to_string_lossy()).is_empty());
        assert!(image_paths_from_clipboard_text("file:///does/not/exist.png").is_empty());
        assert!(image_paths_from_clipboard_text("just some copied words").is_empty());
    }
}
