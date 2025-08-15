//! Manages application licensing.
//!
//! This module handles loading, saving, and validating the user's license key.
//! The license is stored in a `license.json` file in the app's config directory.

use crate::error::{ChroniclerError, Result};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};
use tracing::info;

const LICENSE_FILE_NAME: &str = "license.json";
const KEYGEN_ACCOUNT_ID: &str = "42ddc146-90ad-43c1-960d-0abfcf02bd3c";

/// Represents the internal structure of a validated license.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct License {
    pub key: String,
    pub status: String,
    pub expiry: String,
}

// --- Structs for Keygen API Interaction ---

/// Represents the JSON payload for a license validation request to the Keygen API.
#[derive(Serialize)]
struct KeygenValidateRequest<'a> {
    /// Contains the core data for the validation request.
    meta: KeygenValidateRequestMeta<'a>,
}

/// The nested `meta` object within the validation request.
#[derive(Serialize)]
struct KeygenValidateRequestMeta<'a> {
    /// The license key to be validated.
    key: &'a str,
}

/// Represents the top-level structure of the JSON response from the Keygen API.
#[derive(Deserialize, Debug)]
struct KeygenValidateResponse {
    /// Contains the validation result and status code.
    meta: KeygenResponseMeta,
    /// Contains the detailed license data if the key is valid. This field is optional.
    #[serde(default)]
    data: Option<KeygenResponseData>,
}

/// The nested `meta` object within the API response, indicating the result.
#[derive(Deserialize, Debug)]
struct KeygenResponseMeta {
    /// A boolean indicating whether the license key is valid.
    valid: bool,
    /// A status code from Keygen (e.g., "VALID", "INVALID", "EXPIRED").
    code: String,
}

/// The nested `data` object containing the license's details.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct KeygenResponseData {
    /// The core attributes of the license policy.
    attributes: KeygenLicenseAttributes,
}

/// The attributes of a valid license. This struct now only extracts the
/// status and expiry, which are consistently available.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct KeygenLicenseAttributes {
    /// The status of the license (e.g., "ACTIVE").
    status: String,
    /// The expiration date of the license, if applicable.
    expiry: Option<String>,
}

// --- File Operations ---

/// Retrieves the path to the license file.
fn get_license_path(app_handle: &AppHandle) -> Result<PathBuf> {
    let config_dir = app_handle.path().app_config_dir()?;
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)?;
    }
    Ok(config_dir.join(LICENSE_FILE_NAME))
}

/// Loads the application license from disk.
pub fn load_license(app_handle: &AppHandle) -> Result<Option<License>> {
    let path = get_license_path(app_handle)?;
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path)?;
    let license: License = serde_json::from_str(&content)?;
    Ok(Some(license))
}

/// Saves the application license to disk.
pub fn save_license(app_handle: &AppHandle, license: &License) -> Result<()> {
    let path = get_license_path(app_handle)?;
    let content = serde_json::to_string_pretty(license)?;
    fs::write(path, content)?;
    info!("License saved successfully.");
    Ok(())
}

/// Validates a license key by calling the Keygen.sh API.
pub async fn validate_license(license_key: &str) -> Result<License> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.keygen.sh/v1/accounts/{}/licenses/actions/validate-key",
        KEYGEN_ACCOUNT_ID
    );

    let request_payload = KeygenValidateRequest {
        meta: KeygenValidateRequestMeta { key: license_key },
    };

    let response = client
        .post(&url)
        .header("Content-Type", "application/vnd.api+json")
        .header("Accept", "application/vnd.api+json")
        .json(&request_payload)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_body = response.text().await.unwrap_or_default();
        return Err(ChroniclerError::LicenseInvalid(format!(
            "API request failed: {}",
            error_body
        )));
    }

    let validation_response = response.json::<KeygenValidateResponse>().await?;

    if validation_response.meta.valid {
        if let Some(data) = validation_response.data {
            // Construct the simplified License object.
            let license = License {
                key: license_key.to_string(),
                status: data.attributes.status,
                expiry: data
                    .attributes
                    .expiry
                    .unwrap_or_else(|| "Never".to_string()),
            };
            Ok(license)
        } else {
            Err(ChroniclerError::LicenseInvalid(
                "License is valid, but no data was returned.".to_string(),
            ))
        }
    } else {
        Err(ChroniclerError::LicenseInvalid(format!(
            "Invalid key. Reason: {}",
            validation_response.meta.code
        )))
    }
}
