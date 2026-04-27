//! Handles the discovery of user-provided custom fonts.
//!
//! Scans the app's `fonts/` config subdirectory for `.woff2`, `.ttf`, and
//! `.otf` files and returns one `UserFont` per file. The display name is read
//! directly from the font's OpenType `name` table (NameID 4 — "Full Name"),
//! with a fallback chain to NameID 1 + 2 ("Family" + "Subfamily") and finally
//! to the file stem.
//!
//! Why we read the name table ourselves instead of using `font_kit`: font-kit
//! dispatches to Core Text on macOS, DirectWrite on Windows, and FreeType on
//! Linux. The three backends disagree on what to return for fonts with
//! missing or oddly formatted name records, so the same `.ttf` could yield
//! three different names on three platforms — and sometimes return strings
//! whose characters got later stripped by the frontend's CSS-safety
//! sanitizer, silently breaking selection. `ttf-parser` is pure Rust with no
//! platform dispatch, so the parsed name is identical on every OS.

use crate::error::Result;
use crate::utils::serialize_pathbuf_as_web_str;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tracing::warn;
use ttf_parser::{Face, PlatformId};

/// Represents a single user-provided font, prepared for frontend consumption.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserFont {
    /// The font's display name. Read from the OpenType `name` table when
    /// possible; falls back to the file stem when the file is unparseable
    /// (e.g. WOFF2, which is Brotli-compressed and not supported by
    /// ttf-parser).
    pub name: String,
    /// The absolute path to the font file.
    #[serde(serialize_with = "serialize_pathbuf_as_web_str")]
    pub path: PathBuf,
}

const VALID_EXTENSIONS: &[&str] = &["woff2", "ttf", "otf"];

// OpenType `name` table NameID constants, per the spec
// (https://learn.microsoft.com/en-us/typography/opentype/spec/name).
const NAME_ID_FAMILY: u16 = 1;
const NAME_ID_SUBFAMILY: u16 = 2;
const NAME_ID_FULL_NAME: u16 = 4;

/// Scans the app's `config/fonts` directory for valid font files and returns them.
pub fn get_user_fonts(app_handle: &AppHandle) -> Result<Vec<UserFont>> {
    let fonts_dir = app_handle.path().app_config_dir()?.join("fonts");

    if !fonts_dir.exists() {
        fs::create_dir_all(&fonts_dir)?;
    }

    let mut user_fonts = Vec::new();

    for entry in fs::read_dir(fonts_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let has_valid_ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|e| VALID_EXTENSIONS.contains(&e.to_lowercase().as_str()))
            .unwrap_or(false);
        if !has_valid_ext {
            continue;
        }

        let Some(name) = resolve_font_name(&path) else {
            warn!("Skipping font with no usable name: {:?}", path);
            continue;
        };

        user_fonts.push(UserFont { name, path });
    }

    // Sort by name for deterministic ordering across platforms — fs::read_dir
    // doesn't guarantee order and NTFS vs ext4 may differ.
    user_fonts.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(user_fonts)
}

/// Resolves the display name for a font file, trying the parsed OpenType
/// metadata first and falling back to the file stem.
fn resolve_font_name(path: &Path) -> Option<String> {
    let parsed = read_font_display_name(path);
    let stem = || {
        path.file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
    };
    parsed.or_else(stem).filter(|s| !s.is_empty())
}

/// Reads the user-facing display name from a TTF/OTF file.
///
/// Returns `None` for unsupported formats (notably WOFF2) or for files whose
/// `name` table is missing the relevant records.
fn read_font_display_name(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    // ttf-parser handles TrueType / OpenType directly. WOFF and WOFF2 are
    // compressed wrappers that need a separate decoder; fall back to the
    // file stem for those.
    if ext != "ttf" && ext != "otf" {
        return None;
    }

    let data = fs::read(path).ok()?;
    let face = Face::parse(&data, 0).ok()?;

    // 1. NameID 4 (Full Name) is the canonical user-facing display string —
    //    e.g. "Burbank Big Condensed Bold".
    if let Some(name) = read_name_record(&face, NAME_ID_FULL_NAME) {
        return Some(name);
    }

    // 2. Some fonts omit NameID 4. Compose from Family + Subfamily.
    let family = read_name_record(&face, NAME_ID_FAMILY)?;
    let subfamily = read_name_record(&face, NAME_ID_SUBFAMILY);
    Some(match subfamily {
        Some(sub) if !sub.eq_ignore_ascii_case("regular") => format!("{family} {sub}"),
        _ => family,
    })
}

/// Reads a single string from the OpenType `name` table by NameID, preferring
/// English-language records over other locales.
fn read_name_record(face: &Face, name_id: u16) -> Option<String> {
    let mut english_match: Option<String> = None;
    let mut any_match: Option<String> = None;

    for record in face.names() {
        if record.name_id != name_id {
            continue;
        }
        let Some(decoded) = record.to_string() else {
            continue;
        };
        let trimmed = decoded.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Per the OpenType spec, language_id encodings are platform-specific:
        // Windows uses LCID values (0x0409 == en-US); Macintosh uses Apple
        // language codes (0 == English); Unicode platform records have no
        // language association so we treat them as universally usable.
        let is_english = match record.platform_id {
            PlatformId::Windows => record.language_id == 0x0409,
            PlatformId::Macintosh => record.language_id == 0,
            PlatformId::Unicode => true,
            _ => false,
        };

        if is_english && english_match.is_none() {
            english_match = Some(trimmed.to_string());
        }
        if any_match.is_none() {
            any_match = Some(trimmed.to_string());
        }
    }

    english_match.or(any_match)
}
