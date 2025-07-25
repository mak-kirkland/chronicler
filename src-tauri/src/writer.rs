//! File System Writer
//!
//! This module is responsible for all direct, stateful write operations on the vault's
//! file system. It provides a safe, transactional API for creating, renaming, and
//! deleting files and folders, ensuring data integrity through rollback mechanisms.

use crate::{
    error::{ChroniclerError, Result},
    models::PageHeader,
    utils::file_stem_string,
    wikilink::WIKILINK_RE,
};
use regex::Captures;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};
use tracing::{instrument, warn};

/// A component responsible for performing safe, transactional file system
/// write operations within the vault.
#[derive(Debug, Clone)]
pub struct Writer;

impl Writer {
    /// Creates a new Writer for the specified root path.
    pub fn new() -> Self {
        Self
    }

    /// Creates a new, empty markdown file.
    #[instrument(skip(self))]
    pub fn create_new_file(&self, parent_dir: &str, file_name: &str) -> Result<PageHeader> {
        let mut path = PathBuf::from(parent_dir);
        path.push(file_name.trim());
        path.set_extension("md");

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

        fs::write(&path, default_content)?;

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
        let mut new_path = parent.join(new_name.trim());

        if old_path.is_file() {
            new_path.set_extension("md");
        }

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
    /// This internal function is called by both `rename_path` and `move_item`. It prepares
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

        // --- 1. Prepare Phase: Calculate all required file changes in memory ---
        let mut backlink_updates: HashMap<PathBuf, String> = HashMap::new();
        if old_path.is_file() {
            let old_name_stem = file_stem_string(old_path);
            let new_name_stem = file_stem_string(&new_path);

            for backlink_path in backlinks {
                if let Some(new_content) =
                    self.replace_wikilink_in_file(backlink_path, &old_name_stem, &new_name_stem)?
                {
                    backlink_updates.insert(backlink_path.clone(), new_content);
                }
            }
        }

        // --- 2. Transaction Phase: Perform all file system changes ---
        if let Err(e) = self.perform_rename_transaction(old_path, &new_path, &backlink_updates) {
            warn!("Rename transaction failed and was rolled back: {}", e);
            // The transaction function handles its own rollback.
            return Err(e);
        }

        Ok(new_path)
    }

    /// Performs the file system part of a rename operation transactionally.
    ///
    /// It uses a backup-and-replace strategy to ensure that if any operation fails, all changes
    /// can be safely rolled back.
    ///
    /// # The Transaction Process:
    /// 1.  Backup: For every file to be modified, it is first renamed to a `.bak` file.
    /// 2.  Commit: The new content is written and the original file is moved to its new path.
    /// 3.  Rollback: If the commit succeeds, all `.bak` files are deleted. If it fails, the
    ///     `.bak` files are renamed back to their original names, restoring the vault to its
    ///     original state.
    fn perform_rename_transaction(
        &self,
        old_path: &Path,
        new_path: &Path,
        backlink_updates: &HashMap<PathBuf, String>,
    ) -> Result<()> {
        let mut backup_paths: Vec<(PathBuf, PathBuf)> = Vec::new();

        let result: Result<()> = (|| {
            let old_path_bak = old_path.with_extension("md.bak");
            fs::rename(old_path, &old_path_bak)?;
            backup_paths.push((old_path_bak.clone(), old_path.to_path_buf()));

            for path in backlink_updates.keys() {
                let bak_path = path.with_extension("md.bak");
                fs::rename(path, &bak_path)?;
                backup_paths.push((bak_path, path.clone()));
            }

            fs::rename(&old_path_bak, new_path)?;

            for (path, new_content) in backlink_updates {
                fs::write(path, new_content)?;
            }

            Ok(())
        })();

        match result {
            Ok(()) => {
                for (bak_path, original_path) in &backup_paths {
                    if original_path != old_path {
                        if let Err(e) = fs::remove_file(bak_path) {
                            warn!("Failed to clean up backup file {:?}: {}", bak_path, e);
                        }
                    }
                }
                Ok(())
            }
            Err(e) => {
                warn!(
                    "An error occurred during rename transaction, rolling back. Error: {}",
                    e
                );
                for (bak_path, original_path) in backup_paths {
                    if bak_path.exists() {
                        if let Err(rollback_err) = fs::rename(&bak_path, &original_path) {
                            tracing::error!(
                                "CRITICAL: Failed to roll back {:?} to {:?}: {}",
                                bak_path,
                                original_path,
                                rollback_err
                            );
                        }
                    }
                }
                Err(e)
            }
        }
    }

    /// Reads a file and replaces all instances of a given wikilink.
    ///
    /// This function is a core part of the `rename_path` transaction. It reads the
    /// content of a file, finds all wikilinks pointing to `old_stem`, and replaces
    /// them with new_stem`, preserving any sections or aliases.
    ///
    /// # Arguments
    /// * `file_path` - The path to the file to be read and processed.
    /// * `old_stem` - The old name of the linked file (without extension).
    /// * `new_stem` - The new name to replace the old one with.
    ///
    /// # Returns
    /// - `Ok(Some(String))` if the file content was changed.
    /// - `Ok(None)` if no links needed to be updated.
    /// - `Err` if the file could not be read.
    fn replace_wikilink_in_file(
        &self,
        file_path: &Path,
        old_stem: &str,
        new_stem: &str,
    ) -> Result<Option<String>> {
        let content = fs::read_to_string(file_path)?;
        let old_stem_lower = old_stem.to_lowercase();

        let new_content = WIKILINK_RE.replace_all(&content, |caps: &Captures| {
            let target = caps.get(1).map_or("", |m| m.as_str());
            if target.to_lowercase() == old_stem_lower {
                let section = caps.get(2).map_or("", |m| m.as_str());
                let alias = caps.get(3).map_or("", |m| m.as_str());
                format!(
                    "[[{new_stem}{section}{alias}]]",
                    section = if section.is_empty() {
                        "".to_string()
                    } else {
                        format!("#{}", section)
                    },
                    alias = if alias.is_empty() {
                        "".to_string()
                    } else {
                        format!("|{}", alias)
                    },
                )
            } else {
                caps.get(0).unwrap().as_str().to_string()
            }
        });

        if new_content != content {
            Ok(Some(new_content.into_owned()))
        } else {
            Ok(None)
        }
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
    fn test_rename_path_transaction_rollback() {
        let (_dir, page1_path, page2_path) = setup_writer_test_vault();
        let writer = Writer::new();

        let original_content1 = fs::read_to_string(&page1_path).unwrap();
        let original_content2 = fs::read_to_string(&page2_path).unwrap();

        // --- Induce Failure ---
        // Make the directory read-only to cause the final `fs::write` to fail.
        let readonly_perms = fs::Permissions::from_mode(0o555);
        fs::set_permissions(page2_path.parent().unwrap(), readonly_perms).unwrap();

        // --- Attempt the Rename ---
        let backlinks = HashSet::from([page2_path.clone()]);
        let result = writer.rename_path(&page1_path, "First Chapter", &backlinks);

        // --- Make directory writable again for cleanup and asserts ---
        let writable_perms = fs::Permissions::from_mode(0o755);
        fs::set_permissions(_dir.path(), writable_perms).unwrap();

        // --- Assertions ---
        assert!(result.is_err(), "Expected the rename operation to fail");
        assert!(page1_path.exists(), "Original file should be restored");
        assert!(page2_path.exists(), "Backlink file should be restored");

        let new_path = _dir.path().join("First Chapter.md");
        assert!(
            !new_path.exists(),
            "New file should not exist after rollback"
        );

        let final_content1 = fs::read_to_string(&page1_path).unwrap();
        let final_content2 = fs::read_to_string(&page2_path).unwrap();
        assert_eq!(original_content1, final_content1);
        assert_eq!(original_content2, final_content2);
    }
}
