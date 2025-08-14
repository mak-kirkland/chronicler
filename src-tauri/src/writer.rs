//! File System Writer
//!
//! This module is responsible for all direct, stateful write operations on the vault's
//! file system. It provides a safe, transactional API for creating, renaming, and
//! deleting files and folders, ensuring data integrity through atomic writes.

use crate::{
    error::{ChroniclerError, Result},
    models::PageHeader,
    utils::{file_stem_string, is_markdown_file},
    wikilink::WIKILINK_RE,
};
use regex::Captures;
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use tempfile::NamedTempFile;
use tracing::{error, instrument, warn};

/// Represents a required change to a single backlink file, including its original content for rollback.
struct BacklinkUpdate {
    path: PathBuf,
    old_content: String,
    new_content: String,
}

/// A component responsible for performing safe, transactional file system
/// write operations within the vault.
#[derive(Debug, Clone)]
pub struct Writer;

/// Writes content to a file atomically using the `tempfile` crate.
///
/// This creates a named temporary file in the same directory, writes the content,
/// and then atomically renames it to the final destination. The `tempfile` crate
/// ensures the temporary file is automatically cleaned up if an error occurs
/// before the final `persist` call, preventing stray `.tmp` files.
#[instrument(skip(content), fields(path = %path.display()))]
fn atomic_write(path: &Path, content: &str) -> Result<()> {
    let parent_dir = path
        .parent()
        .ok_or_else(|| ChroniclerError::InvalidPath(path.to_path_buf()))?;

    // 1. Create a new temporary file in the same directory as the target.
    let mut temp_file = NamedTempFile::new_in(parent_dir)?;

    // 2. Write the content to the temporary file.
    temp_file.write_all(content.as_bytes())?;

    // 3. Atomically rename the temporary file to the final path.
    // The `persist` method handles this and prevents the temp file from being
    // deleted on drop. The error is converted into our application's error type.
    temp_file.persist(path).map_err(|e| e.error)?;

    Ok(())
}

/// Replaces all instances of a given wikilink within a string.
///
/// This function is a core part of the rename transaction. It processes the
/// content of a file, finds all wikilinks pointing to `old_stem`, and replaces
/// them with `new_stem`, preserving any sections or aliases.
///
/// # Returns
/// - `Some(String)` if the content was changed.
/// - `None` if no links needed to be updated.
fn replace_wikilink_in_content(content: &str, old_stem: &str, new_stem: &str) -> Option<String> {
    let old_stem_lower = old_stem.to_lowercase();

    // Use `replace_all` to build a new string with updated wikilinks.
    let new_content = WIKILINK_RE.replace_all(content, |caps: &Captures| {
        let target = caps.get(1).map_or("", |m| m.as_str());
        // Perform a case-insensitive comparison on the link target.
        if target.to_lowercase() == old_stem_lower {
            let section = caps.get(2).map_or("", |m| m.as_str());

            // Check if an alias exists.
            if let Some(alias_match) = caps.get(3) {
                // An alias is present, so include it with the pipe.
                format!("[[{new_stem}{section}|{}]]", alias_match.as_str())
            } else {
                // No alias was present, so don't add a pipe.
                format!("[[{new_stem}{section}]]")
            }
        } else {
            // If the link doesn't match, return the original text of the match.
            caps.get(0).unwrap().as_str().to_string()
        }
    });

    // Only return the new content if it has actually changed.
    if new_content != content {
        Some(new_content.into_owned())
    } else {
        None
    }
}

impl Writer {
    /// Creates a new Writer.
    pub fn new() -> Self {
        Self
    }

    /// Creates a new, empty markdown file using an atomic write.
    #[instrument(skip(self))]
    pub fn create_new_file(&self, parent_dir: &str, file_name: &str) -> Result<PageHeader> {
        let path = PathBuf::from(parent_dir).join(format!("{}.md", file_name.trim()));

        if path.exists() {
            return Err(ChroniclerError::FileAlreadyExists(path));
        }

        let title = file_stem_string(&path);
        let default_content = format!(
            r#"---
title: {title}
tags: [add, your, tags]
---

"#
        );
        // Use the robust atomic_write helper.
        atomic_write(&path, &default_content)?;
        Ok(PageHeader { title, path })
    }

    /// Creates a new, empty folder.
    #[instrument(skip(self))]
    pub fn create_new_folder(&self, parent_dir: &str, folder_name: &str) -> Result<PathBuf> {
        let path = Path::new(parent_dir).join(folder_name.trim());
        if path.exists() {
            return Err(ChroniclerError::FileAlreadyExists(path));
        }
        fs::create_dir_all(&path)?;
        Ok(path)
    }

    /// Deletes a file or folder from the disk.
    #[instrument(skip(self))]
    pub fn delete_path(&self, path: &Path) -> Result<()> {
        if path.is_dir() {
            fs::remove_dir_all(path)?;
        } else {
            fs::remove_file(path)?;
        }
        Ok(())
    }

    /// Renames a file or folder in-place and transactionally updates all files that link to it.
    ///
    /// # Returns
    /// The new path of the renamed file or folder.
    #[instrument(skip(self, backlinks))]
    pub fn rename_path(
        &self,
        old_path: &Path,
        new_name: &str,
        backlinks: &HashSet<PathBuf>,
    ) -> Result<PathBuf> {
        let parent = old_path
            .parent()
            .ok_or_else(|| ChroniclerError::InvalidPath(old_path.to_path_buf()))?;

        let new_path = if old_path.is_file() {
            // Treat the `new_name` as the full stem and manually append the extension.
            let new_filename = if let Some(ext) = old_path.extension().and_then(|s| s.to_str()) {
                // If the original file has an extension, append it.
                format!("{}.{}", new_name.trim(), ext)
            } else {
                // If there's no original extension, the new name is the whole thing.
                new_name.trim().to_string()
            };
            parent.join(new_filename)
        } else {
            // For directories, the name is just the name.
            parent.join(new_name.trim())
        };

        self.execute_rename_or_move(old_path, new_path, backlinks)
    }

    /// Moves a file or folder to a new directory and transactionally updates backlinks.
    /// This function contains the platform-aware path construction logic.
    ///
    /// # Returns
    /// The new path of the moved file or folder.
    #[instrument(skip(self, backlinks))]
    pub fn move_path(
        &self,
        old_path: &Path,
        dest_dir: &Path,
        backlinks: &HashSet<PathBuf>,
    ) -> Result<PathBuf> {
        let file_name = old_path
            .file_name()
            .ok_or_else(|| ChroniclerError::InvalidPath(old_path.to_path_buf()))?;

        let new_path = dest_dir.join(file_name);

        self.execute_rename_or_move(old_path, new_path, backlinks)
    }

    /// Common logic for executing a transactional rename or move operation.
    ///
    /// This internal function is called by both `rename_path` and `move_path`. It prepares
    /// the operation and invokes the transactional process.
    fn execute_rename_or_move(
        &self,
        old_path: &Path,
        new_path: PathBuf,
        backlinks: &HashSet<PathBuf>,
    ) -> Result<PathBuf> {
        if new_path.exists() {
            return Err(ChroniclerError::FileAlreadyExists(new_path.clone()));
        }

        // --- 1. Perform the primary atomic rename ---
        fs::rename(old_path, &new_path)?;

        // --- 2. Atomically update all backlink files ---
        if let Err(e) = self.update_backlinks_for_rename(old_path, &new_path, backlinks) {
            warn!(
                "Backlink update failed after rename, rolling back primary rename: {}",
                e
            );

            // --- ROLLBACK the primary rename ---
            if let Err(rollback_err) = fs::rename(&new_path, old_path) {
                error!(
                    "CRITICAL: FAILED TO ROLL BACK RENAME from {:?} to {:?}: {}. Vault is now inconsistent.",
                    new_path,
                    old_path,
                    rollback_err
                );
            }
            // Return the error from the backlink update
            return Err(e);
        }

        Ok(new_path)
    }

    /// Transactionally updates all files that link to a renamed file.
    ///
    /// This function reads each backlink file, replaces the wikilink, and writes the
    /// file back atomically. If any write fails, it attempts to roll back all
    /// previous writes in the transaction. This is the core reusable logic.
    #[instrument(skip(self, backlinks))]
    pub fn update_backlinks_for_rename(
        &self,
        old_path: &Path,
        new_path: &Path,
        backlinks: &HashSet<PathBuf>,
    ) -> Result<()> {
        if !is_markdown_file(old_path) {
            // Backlink updates only apply to markdown file renames, not folders or other file types.
            return Ok(());
        }

        // --- 1. Prepare Phase: Read files and calculate changes in memory ---
        let old_name_stem = file_stem_string(old_path);
        let new_name_stem = file_stem_string(new_path);
        let mut updates: Vec<BacklinkUpdate> = Vec::new();

        for backlink_path in backlinks {
            let old_content = match fs::read_to_string(backlink_path) {
                Ok(content) => content,
                Err(e) => {
                    warn!(
                        "Failed to read backlink file {:?}, skipping update: {}",
                        backlink_path, e
                    );
                    continue; // Skip this file if it can't be read
                }
            };

            if let Some(new_content) =
                replace_wikilink_in_content(&old_content, &old_name_stem, &new_name_stem)
            {
                updates.push(BacklinkUpdate {
                    path: backlink_path.clone(),
                    old_content,
                    new_content,
                });
            }
        }

        // --- 2. Transaction Phase: Perform all file system changes ---
        let mut successfully_updated: Vec<&BacklinkUpdate> = Vec::new();
        for update in &updates {
            if let Err(e) = atomic_write(&update.path, &update.new_content) {
                // --- ROLLBACK ---
                warn!(
                    "Failed to write backlink file {:?}, rolling back changes. Error: {}",
                    &update.path, e
                );

                // Roll back the already updated backlinks by writing their old content back.
                for change_to_revert in successfully_updated.iter().rev() {
                    if let Err(rollback_err) =
                        atomic_write(&change_to_revert.path, &change_to_revert.old_content)
                    {
                        error!(
                            "CRITICAL: FAILED TO ROLL BACK BACKLINK FILE {:?}: {}. Vault may be inconsistent.",
                            &change_to_revert.path,
                            rollback_err
                        );
                        // Continue trying to roll back the rest of the transaction.
                    }
                }
                return Err(e); // Return the original error
            } else {
                // On success, add the update to our list for potential rollback.
                successfully_updated.push(update);
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf};
    use tempfile::tempdir;

    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    /// Helper function to set up a temporary vault with some files for writer tests
    fn setup_writer_test_vault() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let dir = tempdir().unwrap();
        let root = dir.path();

        let page1_path = root.join("Page One.md");
        fs::write(&page1_path, "This page links to [[Page Two]].").unwrap();

        let page2_path = root.join("Page Two.md");
        fs::write(&page2_path, "This page links back to [[Page One]].").unwrap();

        (dir, page1_path, page2_path)
    }

    /// Helper for the improved rollback test.
    #[cfg(unix)]
    fn setup_multi_backlink_test_vault() -> (tempfile::TempDir, PathBuf, PathBuf, PathBuf) {
        let dir = tempdir().unwrap();
        let root = dir.path();
        let subdir = root.join("subdir");
        fs::create_dir(&subdir).unwrap();

        let page1_path = root.join("Page One.md");
        fs::write(&page1_path, "content").unwrap();

        let backlink1_path = root.join("Backlink One.md");
        fs::write(&backlink1_path, "This page links to [[Page One]].").unwrap();

        let backlink2_path = subdir.join("Backlink Two.md");
        fs::write(&backlink2_path, "This page also links to [[Page One]].").unwrap();

        (dir, page1_path, backlink1_path, backlink2_path)
    }

    #[test]
    fn test_rename_path_updates_links() {
        let (_dir, page1_path, page2_path) = setup_writer_test_vault();
        let writer = Writer::new();

        // In a real scenario, this would be fetched from the indexer.
        let backlinks = HashSet::from([page2_path.clone()]);
        let new_path = writer
            .rename_path(&page1_path, "First Chapter", &backlinks)
            .unwrap();

        // Assertions
        assert_eq!(new_path, _dir.path().join("First Chapter.md"));
        assert!(new_path.exists());
        assert!(!page1_path.exists());

        let page2_content = fs::read_to_string(&page2_path).unwrap();
        assert!(page2_content.contains("[[First Chapter]]"));
        assert!(!page2_content.contains("[[Page One]]"));
    }

    #[test]
    #[cfg(unix)]
    fn test_rename_path_full_transaction_rollback() {
        // This test ensures that if a backlink update fails mid-transaction,
        // both the main rename AND any previously successful backlink updates are reverted.
        let (_dir, page1_path, backlink1_path, backlink2_path) = setup_multi_backlink_test_vault();
        let writer = Writer::new();

        let original_content_b1 = fs::read_to_string(&backlink1_path).unwrap();
        let original_content_b2 = fs::read_to_string(&backlink2_path).unwrap();

        // Make the subdirectory for backlink2 read-only to cause atomic_write to fail there.
        // This makes it likely that the write for backlink1 will succeed first, testing the rollback.
        let subdir = backlink2_path.parent().unwrap();
        let readonly_perms = fs::Permissions::from_mode(0o555); // r-x
        fs::set_permissions(subdir, readonly_perms).unwrap();

        let backlinks = HashSet::from([backlink1_path.clone(), backlink2_path.clone()]);
        let result = writer.rename_path(&page1_path, "New Name", &backlinks);

        // Restore permissions for cleanup
        let writable_perms = fs::Permissions::from_mode(0o755); // rwx
        fs::set_permissions(subdir, writable_perms).unwrap();

        // --- Assertions ---
        assert!(result.is_err(), "Expected the rename operation to fail");

        // Assert main rename was rolled back
        assert!(
            page1_path.exists(),
            "Original file should exist after rollback"
        );
        assert!(
            !_dir.path().join("New Name.md").exists(),
            "New file should not exist after rollback"
        );

        // The backlink update function should handle its own rollback.
        // Since the primary rename is rolled back, we only need to check that the
        // backlink files are in their original state.
        let final_content_b1 = fs::read_to_string(&backlink1_path).unwrap();
        assert_eq!(
            original_content_b1, final_content_b1,
            "The first backlink's content should be in its original state."
        );

        // Assert that the backlink that was never touched remains unchanged
        let final_content_b2 = fs::read_to_string(&backlink2_path).unwrap();
        assert_eq!(
            original_content_b2, final_content_b2,
            "The second backlink's content should be unchanged."
        );
    }
}
