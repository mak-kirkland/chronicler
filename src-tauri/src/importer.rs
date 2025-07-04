//! Handles importing documents by converting them with Pandoc.

use crate::error::{ChroniclerError, Result};
use std::env::consts::{ARCH, OS};
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};
use tracing::{error, info, instrument, warn};

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

    // Pandoc extracts into a subdirectory, e.g. pandoc-3.7.0.2-windows-x86_64/pandoc-3.7.0.2/
    // We need to find the executable within that structure.
    let pattern = format!(
        "{}/pandoc-{}/**/{}",
        pandoc_dir.to_string_lossy(),
        PANDOC_VERSION,
        exe_name
    );

    match glob::glob(&pattern)?.next() {
        Some(Ok(path)) => Ok(path),
        _ => {
            // Fallback for simpler structures
            let simple_path = pandoc_dir.join(exe_name);
            if simple_path.exists() {
                Ok(simple_path)
            } else {
                Err(ChroniclerError::PandocNotFound)
            }
        }
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

/// Converts a list of .docx files to Markdown.
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
            .ok_or_else(|| ChroniclerError::InvalidPath(docx_path.clone()))?;
        let md_filename = format!("{}.md", file_stem.to_string_lossy());
        let output_path = output_dir.join(md_filename);

        info!("Converting {:?} to {:?}", docx_path, output_path);

        let output = Command::new(&pandoc_exe)
            .arg(&docx_path)
            .arg("-f")
            .arg("docx")
            .arg("-t")
            .arg("gfm") // Use GitHub Flavored Markdown for better table/strikethrough support
            .arg("--preserve-tabs")
            .arg("-o")
            .arg(&output_path)
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!("Pandoc conversion failed for {:?}: {}", docx_path, stderr);
            return Err(ChroniclerError::PandocConversionFailed(
                docx_path.to_string_lossy().to_string(),
            ));
        }
        output_files.push(output_path);
    }
    Ok(output_files)
}
