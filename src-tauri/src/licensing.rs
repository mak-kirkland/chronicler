//! Manages application licensing.
//!
//! This module handles loading, saving, and validating the user's license key.
//! The license is stored in a `license.json` file in the app's config directory.

use crate::error::{ChroniclerError, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

// --- Data Structures ---

/// Represents the license data as it is stored locally on disk.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct License {
    pub id: String,
    pub key: String,
    pub status: String,
    pub expiry: Option<DateTime<Utc>>,
}

// Structs for deserializing the response from the Keygen API.
// We only define the fields we actually need.

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct KeygenMeta {
    valid: bool,
    detail: String,
    code: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct KeygenLicenseAttributes {
    key: String,
    status: String,
    expiry: Option<DateTime<Utc>>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct KeygenLicenseData {
    id: String,
    attributes: KeygenLicenseAttributes,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct KeygenValidationResponse {
    data: Option<KeygenLicenseData>,
    meta: KeygenMeta,
}

// --- Constants ---

const LICENSE_FILE_NAME: &str = "license.json";

const KEYGEN_ACCOUNT_ID: &str = "42ddc146-90ad-43c1-960d-0abfcf02bd3c";
const KEYGEN_PRODUCT_ID: &str = "834d79c0-16f7-401f-b3a9-a176c39a1723";
const KEYGEN_PRODUCT_TOKEN: &str =
    "prod-cefca8dc2c4ac330cf9c8cbe49de1aae7e795298ab7e9ea630828f1c9f9d2a4av3";

/// Validates a license key against the Keygen API. If the key is valid but the
/// machine is not yet activated, this function will perform the activation.
#[tracing::instrument(skip(license_key))]
pub async fn validate_license(license_key: &str) -> Result<License> {
    if KEYGEN_PRODUCT_TOKEN == "YOUR_PRODUCT_TOKEN_HERE" {
        return Err(ChroniclerError::LicenseInvalid(
            "The KEYGEN_PRODUCT_TOKEN has not been set in licensing.rs".to_string(),
        ));
    }

    // Get a unique identifier for this machine.
    let fingerprint = machine_uid::get()
        .map_err(|e| ChroniclerError::LicenseInvalid(format!("Could not get machine ID: {}", e)))?;
    tracing::info!(?fingerprint, "Got machine fingerprint.");

    let client = reqwest::Client::new();

    // --- STEP 1: VALIDATE THE KEY ---
    tracing::info!("Step 1: Validating license key...");
    let validation_url = format!(
        "https://api.keygen.sh/v1/accounts/{}/licenses/actions/validate-key",
        KEYGEN_ACCOUNT_ID
    );

    let res = client
        .post(&validation_url)
        .header("Content-Type", "application/vnd.api+json")
        .header("Accept", "application/vnd.api+json")
        .json(&serde_json::json!({
            "meta": {
                "scope": {
                    "product": KEYGEN_PRODUCT_ID,
                    "fingerprint": fingerprint
                },
                "key": license_key
            }
        }))
        .send()
        .await?;

    let validation_response: KeygenValidationResponse = res.json().await?;
    tracing::info!(?validation_response.meta, "Validation response received.");

    let license_data = validation_response
        .data
        .ok_or_else(|| ChroniclerError::LicenseInvalid(validation_response.meta.detail.clone()))?;

    // --- STEP 2: CHECK THE RESPONSE & ACTIVATE IF NEEDED ---
    if validation_response.meta.valid {
        tracing::info!("License is valid and machine is already activated.");
    } else if validation_response.meta.code == "NO_MACHINES" {
        tracing::info!("Step 2: Activating machine...");
        let activation_url = format!(
            "https://api.keygen.sh/v1/accounts/{}/machines",
            KEYGEN_ACCOUNT_ID
        );

        let activation_res = client
            .post(&activation_url)
            // VV ADD THE AUTHORIZATION HEADER VV
            .header("Authorization", format!("Bearer {}", KEYGEN_PRODUCT_TOKEN))
            .header("Content-Type", "application/vnd.api+json")
            .header("Accept", "application/vnd.api+json")
            .json(&serde_json::json!({
                "data": {
                    "type": "machines",
                    "attributes": {
                        "fingerprint": fingerprint
                    },
                    "relationships": {
                        "license": {
                            "data": { "type": "licenses", "id": license_data.id }
                        }
                    }
                }
            }))
            .send()
            .await?;

        if !activation_res.status().is_success() {
            let error_body: serde_json::Value = activation_res.json().await?;
            let detail = error_body["errors"][0]["detail"]
                .as_str()
                .unwrap_or("Activation failed for an unknown reason.");
            tracing::error!(?error_body, "Machine activation failed.");
            return Err(ChroniclerError::LicenseInvalid(detail.to_string()));
        }

        tracing::info!("Machine activated successfully.");
    } else {
        tracing::error!("License validation failed with unrecoverable code.");
        return Err(ChroniclerError::LicenseInvalid(
            validation_response.meta.detail,
        ));
    }

    // --- STEP 3: RETURN THE LOCAL LICENSE STRUCT ---
    Ok(License {
        id: license_data.id,
        key: license_data.attributes.key,
        status: license_data.attributes.status,
        expiry: license_data.attributes.expiry,
    })
}

/// Saves the validated license to the application's config directory.
pub fn save_license(app_handle: &AppHandle, license: &License) -> Result<()> {
    let license_path = app_handle.path().app_config_dir()?.join(LICENSE_FILE_NAME);
    let file = std::fs::File::create(license_path)?;
    serde_json::to_writer_pretty(file, license)?;
    Ok(())
}

/// Loads the license from the config directory, if it exists.
pub fn load_license(app_handle: &AppHandle) -> Result<Option<License>> {
    let license_path = app_handle.path().app_config_dir()?.join(LICENSE_FILE_NAME);
    if license_path.exists() {
        let file = std::fs::File::open(license_path)?;
        let license: License = serde_json::from_reader(file)?;
        Ok(Some(license))
    } else {
        Ok(None)
    }
}
