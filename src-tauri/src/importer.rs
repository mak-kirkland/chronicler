//! Handles importing documents by converting them with Pandoc.

use crate::error::{ChroniclerError, Result};
use std::env::consts::{ARCH, OS};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};
use tracing::{error, info, instrument, warn};
use walkdir::WalkDir;

const PANDOC_VERSION: &str = "3.7.0.2";

/// Returns the platform-specific directory where Pandoc should be.
fn get_pandoc_dir(app_handle: &AppHandle) -> Result<PathBuf> {
    let config_dir = app_handle.path().app_config_dir()?;
    Ok(config_dir.join(format!("pandoc-{}", PANDOC_VERSION)))
}

/// Returns the full path to the Pandoc executable.
fn get_pandoc_executable_path(app_handle: &AppHandle) -> Result<PathBuf> {
    let pandoc_dir = get_pandoc_dir(app_handle)?;
    let exe_name = if OS == "windows" {
        "pandoc.exe"
    } else {
        "pandoc"
    };

    // The `**` will match any subdirectory structure, like `bin/pandoc` on macOS
    // or a nested versioned folder.
    let pattern = format!("{}/**/{}", pandoc_dir.to_string_lossy(), exe_name);

    match glob::glob(&pattern)?.next() {
        Some(Ok(path)) => Ok(path),
        _ => Err(ChroniclerError::PandocNotFound),
    }
}

/// Checks if Pandoc is installed at the expected path.
#[instrument(skip(app_handle))]
pub fn is_pandoc_installed(app_handle: &AppHandle) -> Result<bool> {
    match get_pandoc_executable_path(app_handle) {
        Ok(path) => Ok(path.exists()),
        Err(ChroniclerError::PandocNotFound) => Ok(false),
        Err(e) => Err(e),
    }
}

/// Downloads and extracts Pandoc for the correct architecture.
#[instrument(skip(app_handle))]
pub async fn download_pandoc(app_handle: AppHandle) -> Result<()> {
    let target_triple = match (OS, ARCH) {
        ("windows", "x86_64") => "windows-x86_64",
        ("macos", "aarch64") => "arm64-macOS",
        ("macos", "x86_64") => "x86_64-macOS",
        ("linux", "x86_64") => "linux-amd64",
        _ => {
            let arch_string = format!("{}-{}", OS, ARCH);
            warn!("Unsupported architecture for Pandoc: {}", arch_string);
            return Err(ChroniclerError::UnsupportedPandocArch(arch_string));
        }
    };

    let extension = if OS == "linux" { "tar.gz" } else { "zip" };
    let url = format!(
        "https://github.com/jgm/pandoc/releases/download/{0}/pandoc-{0}-{1}.{2}",
        PANDOC_VERSION, target_triple, extension
    );

    info!("Downloading Pandoc from: {}", url);

    let response = reqwest::get(&url).await?.bytes().await?;
    let target_dir = get_pandoc_dir(&app_handle)?;

    if target_dir.exists() {
        std::fs::remove_dir_all(&target_dir)?;
    }
    std::fs::create_dir_all(&target_dir)?;

    info!("Extracting Pandoc to: {:?}", target_dir);

    let extraction_result = if extension == "zip" {
        zip_extract::extract(std::io::Cursor::new(response), &target_dir, true)
            .map_err(|e| ChroniclerError::ArchiveExtractionFailed(e.to_string()))
    } else {
        let tar = flate2::read::GzDecoder::new(std::io::Cursor::new(response));
        let mut archive = tar::Archive::new(tar);
        archive
            .unpack(&target_dir)
            .map_err(|e| ChroniclerError::ArchiveExtractionFailed(e.to_string()))
    };

    match extraction_result {
        Ok(_) => {
            info!("Pandoc downloaded and extracted successfully.");
            Ok(())
        }
        Err(e) => {
            error!("Failed to extract Pandoc archive: {}", e);
            // Clean up partial extraction if it fails
            let _ = std::fs::remove_dir_all(&target_dir);
            Err(e)
        }
    }
}

/// Moves the temporarily extracted media folder to its final destination in the images directory.
fn move_media_directory(output_dir: &Path, file_stem: &str) -> Result<()> {
    let temp_media_abs_path = output_dir.join(file_stem);
    if temp_media_abs_path.exists() {
        let final_media_dir = output_dir.join("images");
        std::fs::create_dir_all(&final_media_dir)?;
        let final_media_path = final_media_dir.join(file_stem);

        // For cross-platform safety, remove the destination if it exists before renaming.
        if final_media_path.exists() {
            std::fs::remove_dir_all(&final_media_path)?;
        }

        std::fs::rename(&temp_media_abs_path, &final_media_path)?;
        info!(
            "Moved extracted media from {:?} to {:?}",
            temp_media_abs_path, final_media_path
        );
    }
    Ok(())
}

/// Converts a list of individual .docx files to Markdown and extracts images.
/// Media files are extracted into a subdirectory structure `images/<doc_name>/media`.
#[instrument(skip(app_handle, docx_paths))]
pub fn convert_docx_to_markdown(
    app_handle: &AppHandle,
    docx_paths: Vec<PathBuf>,
    output_dir: PathBuf,
) -> Result<Vec<PathBuf>> {
    let pandoc_exe = get_pandoc_executable_path(app_handle)?;
    info!("Using Pandoc executable at: {:?}", pandoc_exe);
    let mut output_files = Vec::new();

    for docx_path in docx_paths {
        let file_stem = docx_path
            .file_stem()
            .ok_or_else(|| ChroniclerError::InvalidPath(docx_path.clone()))?
            .to_string_lossy();

        let md_filename = format!("{}.md", file_stem);
        let output_path = output_dir.join(&md_filename);

        // This path is relative to `output_dir` and is what Pandoc will use to create links.
        let temp_media_rel_path = PathBuf::from(file_stem.as_ref());

        // Clean up any potential leftovers from a previous failed run.
        let temp_media_abs_path = output_dir.join(&temp_media_rel_path);
        if temp_media_abs_path.exists() {
            std::fs::remove_dir_all(&temp_media_abs_path)?;
        }

        info!(
            "Converting {:?} to {:?}, using temp media path {:?}",
            docx_path, output_path, temp_media_abs_path
        );

        // Pandoc creates links relative to the output file. By passing `file_stem` to
        // `--extract-media`, it will create `<output_dir>/<file_stem>/media` and the
        // markdown links will be correctly formed as `<file_stem>/media/image.png`.
        let output = Command::new(&pandoc_exe)
            .current_dir(&output_dir)
            .arg(&docx_path)
            .arg("-f")
            .arg("docx")
            .arg("-t")
            .arg("gfm") // Use GitHub Flavored Markdown for better table/strikethrough support
            .arg("--preserve-tabs")
            .arg("--extract-media")
            .arg(&temp_media_rel_path) // Extract to `<output_dir>/<file_stem>`
            .arg("-o")
            .arg(&md_filename)
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!("Pandoc conversion failed for {:?}: {}", docx_path, stderr);
            return Err(ChroniclerError::PandocConversionFailed(
                docx_path.to_string_lossy().to_string(),
            ));
        }

        // Now, move the extracted media directory to its final destination.
        move_media_directory(&output_dir, &file_stem)?;

        output_files.push(output_path);
    }

    Ok(output_files)
}

/// Scans a directory recursively for .docx files and converts them to Markdown.
///
/// This function uses the `walkdir` crate to efficiently traverse the directory
/// tree. It collects all found `.docx` files and then delegates the actual
/// conversion to the `convert_docx_to_markdown` function.
#[instrument(skip(app_handle))]
pub fn convert_docx_in_folder(
    app_handle: &AppHandle,
    folder_path: &Path,
    output_dir: PathBuf,
) -> Result<Vec<PathBuf>> {
    info!("Scanning folder for .docx files: {:?}", folder_path);

    // Use WalkDir to iterate through all files in the given folder and its subdirectories.
    let docx_paths: Vec<PathBuf> = WalkDir::new(folder_path)
        .into_iter()
        .filter_map(|e| e.ok()) // Ignore any directory traversal errors.
        .filter(|e| {
            // Check if the entry is a file and has a ".docx" extension (case-insensitive).
            e.path().is_file()
                && e.path()
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("docx"))
        })
        .map(|e| e.path().to_path_buf())
        .collect();

    if docx_paths.is_empty() {
        info!("No .docx files found in the specified folder.");
        return Ok(Vec::new());
    }

    info!("Found {} .docx files to import.", docx_paths.len());
    convert_docx_to_markdown(app_handle, docx_paths, output_dir)
}
