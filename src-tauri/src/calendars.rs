//! Calendar definition storage: `<vault>/.chronicler/calendars/<id>.json`.
//!
//! Calendars are opaque JSON to the backend — validation and interpretation
//! live in the frontend engine (src/lib/calendar.ts). This module only
//! guards ids against path traversal (mirroring snippets.rs) and checks
//! syntactic JSON validity on save so a corrupt write can't wedge the
//! calendar list.

use crate::error::{ChroniclerError, Result};
use std::fs;
use std::path::{Path, PathBuf};

/// The vault-relative directory calendars live in.
pub fn calendars_dir(vault_root: &Path) -> PathBuf {
    vault_root.join(".chronicler").join("calendars")
}

fn ensure_calendars_dir(vault_root: &Path) -> Result<PathBuf> {
    let dir = calendars_dir(vault_root);
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

/// Validates a calendar id: bare slug, no separators or dots, so it can
/// never traverse out of the calendars directory.
pub fn validate_calendar_id(id: &str) -> Result<()> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
        && id.starts_with(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit());
    if ok {
        Ok(())
    } else {
        Err(ChroniclerError::InvalidPath(PathBuf::from(id)))
    }
}

/// Returns the raw JSON text of every `.json` file in the calendars dir,
/// sorted by file name for a stable order. Unreadable files are skipped.
pub fn list_calendar_jsons(vault_root: &Path) -> Result<Vec<String>> {
    let dir = calendars_dir(vault_root);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut names: Vec<PathBuf> = fs::read_dir(&dir)?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("json"))
        })
        .collect();
    names.sort();
    Ok(names
        .into_iter()
        .filter_map(|p| fs::read_to_string(p).ok())
        .collect())
}

/// Saves a calendar's JSON under its id, creating the directory on demand.
/// Rejects invalid ids and syntactically invalid JSON.
pub fn save_calendar_json(vault_root: &Path, id: &str, json: &str) -> Result<()> {
    validate_calendar_id(id)?;
    serde_json::from_str::<serde_json::Value>(json)?;
    let dir = ensure_calendars_dir(vault_root)?;
    fs::write(dir.join(format!("{id}.json")), json)?;
    Ok(())
}

/// Deletes a calendar file by id. Missing files are not an error (the
/// frontend may retry after a partial failure).
pub fn delete_calendar_file(vault_root: &Path, id: &str) -> Result<()> {
    validate_calendar_id(id)?;
    let path = calendars_dir(vault_root).join(format!("{id}.json"));
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn save_then_list_round_trips() {
        let dir = tempdir().unwrap();
        save_calendar_json(dir.path(), "harptos", r#"{"id":"harptos"}"#).unwrap();
        save_calendar_json(dir.path(), "aria", r#"{"id":"aria"}"#).unwrap();
        let listed = list_calendar_jsons(dir.path()).unwrap();
        // Sorted by filename: aria before harptos.
        assert_eq!(listed, vec![r#"{"id":"aria"}"#, r#"{"id":"harptos"}"#]);
    }

    #[test]
    fn list_is_empty_when_dir_missing() {
        let dir = tempdir().unwrap();
        assert_eq!(
            list_calendar_jsons(dir.path()).unwrap(),
            Vec::<String>::new()
        );
    }

    #[test]
    fn rejects_traversal_ids() {
        let dir = tempdir().unwrap();
        for bad in ["../evil", "a/b", "a\\b", "", "UPPER", ".hidden", "-lead"] {
            assert!(
                save_calendar_json(dir.path(), bad, "{}").is_err(),
                "id {bad:?} should be rejected"
            );
        }
    }

    #[test]
    fn rejects_invalid_json() {
        let dir = tempdir().unwrap();
        assert!(save_calendar_json(dir.path(), "ok", "{ nope").is_err());
    }

    #[test]
    fn delete_removes_file_and_tolerates_missing() {
        let dir = tempdir().unwrap();
        save_calendar_json(dir.path(), "gone", "{}").unwrap();
        delete_calendar_file(dir.path(), "gone").unwrap();
        assert_eq!(list_calendar_jsons(dir.path()).unwrap().len(), 0);
        delete_calendar_file(dir.path(), "gone").unwrap(); // second call: no error
    }
}
