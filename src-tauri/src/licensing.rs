//! Manages application licensing.
//!
//! This module handles loading, saving, and validating the user's license key.
//! The license is stored in a `license.json` file in the app's config directory.

use crate::error::{ChroniclerError, Result};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::env;
use tauri::{AppHandle, Manager};
use tracing::{error, info, instrument};

// --- Data Structures ---

/// Represents the signed license as stored on disk.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SignedLicense {
    pub data: License,
    pub signature: String,
}

/// Represents the core license data. (This is your existing License struct)
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

/// Validates a license key against the Keygen API. If the key is valid but the
/// machine is not yet activated, this function will perform the activation.
#[instrument(skip(license_key))]
pub async fn validate_license(license_key: &str) -> Result<License> {
    // Read the product token at COMPILE TIME and bake it into the binary.
    let product_token = env!("KEYGEN_PRODUCT_TOKEN");

    // 1. Get a unique identifier for this machine.
    let fingerprint = machine_uid::get()
        .map_err(|e| ChroniclerError::LicenseInvalid(format!("Could not get machine ID: {}", e)))?;
    info!(?fingerprint, "Got machine fingerprint.");

    let client = reqwest::Client::new();

    // --- STEP 1: VALIDATE THE KEY ---
    info!("Step 1: Validating license key...");
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
    info!(?validation_response.meta, "Validation response received.");

    let license_data = validation_response
        .data
        .ok_or_else(|| ChroniclerError::LicenseInvalid(validation_response.meta.detail.clone()))?;

    // --- STEP 2: CHECK THE RESPONSE & ACTIVATE IF NEEDED ---
    if validation_response.meta.valid {
        info!("License is valid and machine is already activated.");
    } else if validation_response.meta.code == "NO_MACHINES" {
        info!("Step 2: Activating machine...");
        let activation_url = format!(
            "https://api.keygen.sh/v1/accounts/{}/machines",
            KEYGEN_ACCOUNT_ID
        );

        let activation_res = client
            .post(&activation_url)
            .header("Authorization", format!("Bearer {}", product_token)) // <-- Use the loaded variable
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
            error!(?error_body, "Machine activation failed.");
            return Err(ChroniclerError::LicenseInvalid(detail.to_string()));
        }

        info!("Machine activated successfully.");
    } else {
        error!("License validation failed with unrecoverable code.");
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

/// Signs and saves the license to the application's config directory.
pub fn save_license(app_handle: &AppHandle, license: &License) -> Result<()> {
    // Serialize the license data part to a string to sign it.
    let license_data_json = serde_json::to_string(license)?;
    let signing_key = get_signing_key()?;

    let mut mac = HmacSha256::new_from_slice(&signing_key).expect("HMAC can take key of any size");
    mac.update(license_data_json.as_bytes());

    let signature = hex::encode(mac.finalize().into_bytes());

    let signed_license = SignedLicense {
        data: license.clone(), // Use clone as license is borrowed
        signature,
    };

    let license_path = app_handle.path().app_config_dir()?.join(LICENSE_FILE_NAME);
    let file = std::fs::File::create(license_path)?;
    serde_json::to_writer_pretty(file, &signed_license)?;
    info!("License saved and signed successfully.");
    Ok(())
}

/// Loads the license from the config directory, verifies its signature,
/// and checks its validity and expiration.
pub fn load_and_verify_license(app_handle: &AppHandle) -> Result<Option<License>> {
    let license_path = app_handle.path().app_config_dir()?.join(LICENSE_FILE_NAME);
    if !license_path.exists() {
        return Ok(None);
    }

    let file = std::fs::File::open(license_path)?;
    let signed_license: SignedLicense = serde_json::from_reader(file)?;

    // --- VERIFY SIGNATURE ---
    let license_data_json = serde_json::to_string(&signed_license.data)?;
    let signing_key = get_signing_key()?;

    let mut mac = HmacSha256::new_from_slice(&signing_key).expect("HMAC can take key of any size");
    mac.update(license_data_json.as_bytes());

    // Use a constant-time comparison to be safe against timing attacks
    let expected_signature = hex::decode(signed_license.signature)
        .map_err(|_| ChroniclerError::LicenseInvalid("Invalid signature format.".to_string()))?;

    if mac.verify_slice(&expected_signature).is_err() {
        error!("LICENSE TAMPERING DETECTED! Signature mismatch.");
        // Treat a tampered license as invalid. You could also delete the file.
        return Err(ChroniclerError::LicenseInvalid(
            "License file has been tampered with.".to_string(),
        ));
    }
    info!("License signature is valid.");

    // --- CHECK EXPIRATION ---
    let mut license = signed_license.data; // Now we can trust the data
    if let Some(expiry_date) = license.expiry {
        if Utc::now() > expiry_date {
            info!(?expiry_date, "License has expired.");
            license.status = "EXPIRED".to_string();
        }
    }

    // --- FINAL CHECK ---
    if license.status != "ACTIVE" {
        info!(status = %license.status, "License is not active.");
        // You might want to return the license struct anyway so the UI
        // can show the "Expired" or "Suspended" status.
    }

    Ok(Some(license))
}

type HmacSha256 = Hmac<Sha256>;

/// Creates a machine-specific secret key for signing the license file.
fn get_signing_key() -> Result<Vec<u8>> {
    // 1. Get the application secret at COMPILE TIME.
    let app_secret = env!("LICENSE_SECRET");

    // 2. Get the unique machine ID.
    let fingerprint = machine_uid::get()
        .map_err(|e| ChroniclerError::LicenseInvalid(format!("Could not get machine ID: {}", e)))?;

    // 3. Combine them to create the final key.
    let key_data = format!("{}-{}", app_secret, fingerprint);

    Ok(key_data.into_bytes())
}
