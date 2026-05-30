//! Importing images into the vault's `images/` directory.
//!
//! Backs the `import_image_file` command (the editor's "Insert image" button):
//! it sanitizes the filename, enforces a size and type limit, de-duplicates by
//! content, and writes atomically.

use std::fs;
use std::path::Path;

use crate::config::IMAGES_DIR_NAME;
use crate::error::{ChroniclerError, Result};
use crate::models::ImportedImage;

const MAX_IMAGE_BYTES: usize = 25 * 1024 * 1024;
const ALLOWED_IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];

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
    if !ALLOWED_IMAGE_EXTS.contains(&ext.as_str()) {
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

/// Copy `bytes` into `<vault_root>/images/`, returning the resulting reference.
/// An identically-named file with identical content is reused (no write); a name
/// clash with different content gets a numeric suffix.
pub fn write_image_into_vault(
    vault_root: &Path,
    bytes: &[u8],
    suggested_filename: &str,
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
    let images_dir = vault_root.join(IMAGES_DIR_NAME);
    fs::create_dir_all(&images_dir)?;

    let (final_name, reused) = resolve_target_name(&images_dir, &safe_name, bytes)?;
    if !reused {
        crate::writer::atomic_write(&images_dir.join(&final_name), bytes)?;
    }

    Ok(ImportedImage {
        relative_path: format!("{IMAGES_DIR_NAME}/{final_name}"),
        filename: final_name,
        reused,
    })
}

/// Read an image file from disk and import it (used by the picker command).
pub fn import_image_from_path(vault_root: &Path, source_path: &str) -> Result<ImportedImage> {
    let source = Path::new(source_path);
    let suggested = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| ChroniclerError::ImageImport("Invalid source path".into()))?;
    let bytes = fs::read(source)?;
    write_image_into_vault(vault_root, &bytes, suggested)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn writes_new_image() {
        let dir = tempdir().unwrap();
        let out = write_image_into_vault(dir.path(), b"PNGDATA", "diagram.png").unwrap();
        assert_eq!(out.filename, "diagram.png");
        assert_eq!(out.relative_path, "images/diagram.png");
        assert!(!out.reused);
        assert_eq!(
            fs::read(dir.path().join("images/diagram.png")).unwrap(),
            b"PNGDATA"
        );
    }

    #[test]
    fn reuses_identical_existing_file() {
        let dir = tempdir().unwrap();
        write_image_into_vault(dir.path(), b"SAME", "pic.png").unwrap();
        let out = write_image_into_vault(dir.path(), b"SAME", "pic.png").unwrap();
        assert_eq!(out.filename, "pic.png");
        assert!(out.reused);
        assert!(!dir.path().join("images/pic-2.png").exists());
    }

    #[test]
    fn suffixes_on_clash_with_different_content() {
        let dir = tempdir().unwrap();
        write_image_into_vault(dir.path(), b"FIRST", "pic.png").unwrap();
        let out = write_image_into_vault(dir.path(), b"SECOND", "pic.png").unwrap();
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
        let out = write_image_into_vault(dir.path(), b"X", "../../evil.png").unwrap();
        assert_eq!(out.filename, "evil.png");
        assert!(dir.path().join("images/evil.png").exists());
        assert!(!dir.path().parent().unwrap().join("evil.png").exists());
    }

    #[test]
    fn rejects_non_image_extension() {
        let dir = tempdir().unwrap();
        assert!(write_image_into_vault(dir.path(), b"X", "notes.txt").is_err());
    }

    #[test]
    fn rejects_empty_and_oversize() {
        let dir = tempdir().unwrap();
        assert!(write_image_into_vault(dir.path(), b"", "a.png").is_err());
        let big = vec![0u8; MAX_IMAGE_BYTES + 1];
        assert!(write_image_into_vault(dir.path(), &big, "a.png").is_err());
    }
}
