//! Manages application licensing.
//!
//! Licenses are issued by Keygen as Ed25519-signed *machine files*: a
//! self-contained payload that names the license, its entitlements, the
//! machine fingerprint it is bound to, and an expiry. The signed payload is
//! stored on disk verbatim and verified on every load using a public key
//! baked into the binary at build time.
//!
//! Forging a license therefore requires Keygen's *private* signing key - not
//! something an attacker can produce by recompiling Chronicler from source,
//! because the source only contains the verification key.

use crate::{
    error::{ChroniclerError, Result},
    writer::atomic_write,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::env;
use tauri::{AppHandle, Manager};
use tracing::{error, info, instrument, warn};

// --- Public license type returned to the frontend ---

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct License {
    pub id: String,
    pub key: String,
    pub status: String,
    pub expiry: Option<DateTime<Utc>>,
    /// Product codes this license is entitled to (e.g. "maps", "fantasy-pack").
    #[serde(default)]
    pub entitlements: Vec<String>,
}

/// What `validate_license` produces: the parsed license (for the UI) plus the
/// raw Keygen-signed certificate (which is what actually gets persisted).
pub struct ValidatedLicense {
    pub license: License,
    pub certificate: String,
}

// --- On-disk schema ---

#[derive(Serialize, Deserialize)]
struct StoredLicense {
    /// Schema version. Bump when the on-disk shape changes; older versions
    /// are silently ignored and the user is asked to re-validate.
    version: u8,
    /// The Keygen-issued machine file (PEM-style envelope, includes the
    /// Ed25519 signature). Verified on every load.
    certificate: String,
}

const STORED_LICENSE_VERSION: u8 = 2;
const LICENSE_FILE_NAME: &str = "license.json";

// --- Keygen account constants ---

const KEYGEN_ACCOUNT_ID: &str = "42ddc146-90ad-43c1-960d-0abfcf02bd3c";
const KEYGEN_PRODUCT_ID: &str = "834d79c0-16f7-401f-b3a9-a176c39a1723";

/// Keygen's account public key, baked in at build time.
const KEYGEN_PUBLIC_KEY: &str = env!("KEYGEN_PUBLIC_KEY");

// --- Keygen API response shapes (only the fields we need) ---

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct KeygenMeta {
    valid: bool,
    detail: String,
    code: String,
}

#[derive(Deserialize, Debug)]
struct KeygenLicenseData {
    id: String,
}

#[derive(Deserialize, Debug)]
struct KeygenValidationResponse {
    data: Option<KeygenLicenseData>,
    meta: KeygenMeta,
}

#[derive(Deserialize, Debug)]
struct KeygenMachineId {
    id: String,
}

#[derive(Deserialize, Debug)]
struct KeygenMachineSingleResponse {
    data: KeygenMachineId,
}

#[derive(Deserialize, Debug)]
struct KeygenMachineListResponse {
    data: Vec<KeygenMachineId>,
}

#[derive(Deserialize, Debug)]
struct KeygenCertificateAttrs {
    certificate: String,
}

#[derive(Deserialize, Debug)]
struct KeygenCertificateData {
    attributes: KeygenCertificateAttrs,
}

#[derive(Deserialize, Debug)]
struct KeygenCertificateResponse {
    data: KeygenCertificateData,
}

// --- Certificate envelope (the signed wrapper Keygen returns) ---

#[derive(Deserialize, Debug)]
struct CertificateEnvelope {
    /// Base64-encoded JSON payload - what was actually signed.
    enc: String,
    /// Base64-encoded Ed25519 signature over `"machine/<enc>"`.
    sig: String,
    /// Algorithm identifier; we only accept `"base64+ed25519"`.
    alg: String,
}

// --- Inner signed payload (a JSON:API document) ---

#[derive(Deserialize, Debug)]
struct MachineAttrs {
    fingerprint: String,
}

#[derive(Deserialize, Debug)]
struct MachineResource {
    attributes: MachineAttrs,
}

#[derive(Deserialize, Debug)]
struct LicenseAttrs {
    key: String,
    status: String,
    #[serde(default)]
    expiry: Option<DateTime<Utc>>,
}

#[derive(Deserialize, Debug)]
struct EntitlementAttrs {
    code: String,
}

/// One entry in the JSON:API `included` array. We only care about licenses
/// and entitlements; everything else is ignored.
#[derive(Deserialize, Debug)]
#[serde(tag = "type")]
enum IncludedResource {
    #[serde(rename = "licenses")]
    License {
        id: String,
        attributes: LicenseAttrs,
    },
    #[serde(rename = "entitlements")]
    Entitlement { attributes: EntitlementAttrs },
    #[serde(other)]
    Other,
}

#[derive(Deserialize, Debug)]
struct MachineFilePayload {
    data: MachineResource,
    #[serde(default)]
    included: Vec<IncludedResource>,
}

// --- Public API ---

/// Validates the supplied license key against Keygen, ensuring the current
/// machine is activated, and returns a Keygen-signed certificate that can be
/// verified offline on subsequent launches.
#[instrument(skip(license_key))]
pub async fn validate_license(license_key: &str) -> Result<ValidatedLicense> {
    let product_token = env!("KEYGEN_PRODUCT_TOKEN");

    let fingerprint = machine_uid::get()
        .map_err(|e| ChroniclerError::LicenseInvalid(format!("Could not get machine ID: {}", e)))?;
    info!(?fingerprint, "Got machine fingerprint.");

    let client = reqwest::Client::new();

    // 1. Validate the key (and discover whether the machine is already activated).
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
                "scope": { "product": KEYGEN_PRODUCT_ID, "fingerprint": fingerprint },
                "key": license_key,
            }
        }))
        .send()
        .await?;

    let response_text = res.text().await?;
    let validation: KeygenValidationResponse =
        serde_json::from_str(&response_text).map_err(|e| {
            error!("Failed to parse Keygen validation response: {}", e);
            ChroniclerError::LicenseInvalid("Failed to parse license server response.".to_string())
        })?;
    info!(?validation.meta, "Validation response parsed.");

    let license_data = validation
        .data
        .ok_or_else(|| ChroniclerError::LicenseInvalid(validation.meta.detail.clone()))?;

    // 2. Activate (or look up) the machine to get its ID.
    let machine_id = if validation.meta.valid {
        info!("Step 2: Already activated; resolving machine ID by fingerprint.");
        find_machine_id(&client, product_token, &fingerprint).await?
    } else if validation.meta.code == "NO_MACHINES"
        || validation.meta.code == "FINGERPRINT_SCOPE_MISMATCH"
    {
        info!(
            "Step 2: Activating machine for license {}...",
            license_data.id
        );
        activate_machine(&client, product_token, &license_data.id, &fingerprint).await?
    } else {
        error!(code = %validation.meta.code, "License validation failed.");
        return Err(ChroniclerError::LicenseInvalid(validation.meta.detail));
    };

    // 3. Check out a signed machine file containing license + entitlements.
    info!(
        "Step 3: Checking out signed certificate for machine {}...",
        machine_id
    );
    let certificate = check_out_machine(&client, product_token, &machine_id).await?;

    // 4. Verify locally before we trust anything in it. The HTTP
    //    layer is already TLS, but it means a misbehaving server (or
    //    future bug in this code) can't poison our on-disk state.
    let license = verify_certificate(&certificate, &fingerprint)?;
    info!(license_id = %license.id, entitlements = ?license.entitlements, "License certificate verified.");

    Ok(ValidatedLicense {
        license,
        certificate,
    })
}

async fn activate_machine(
    client: &reqwest::Client,
    product_token: &str,
    license_id: &str,
    fingerprint: &str,
) -> Result<String> {
    let url = format!(
        "https://api.keygen.sh/v1/accounts/{}/machines",
        KEYGEN_ACCOUNT_ID
    );

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", product_token))
        .header("Content-Type", "application/vnd.api+json")
        .header("Accept", "application/vnd.api+json")
        .json(&serde_json::json!({
            "data": {
                "type": "machines",
                "attributes": { "fingerprint": fingerprint },
                "relationships": {
                    "license": { "data": { "type": "licenses", "id": license_id } }
                }
            }
        }))
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        error!("Machine activation failed: {} {}", status, body);
        return Err(ChroniclerError::LicenseInvalid(
            "Machine activation failed.".to_string(),
        ));
    }

    let parsed: KeygenMachineSingleResponse = res.json().await?;
    Ok(parsed.data.id)
}

async fn find_machine_id(
    client: &reqwest::Client,
    product_token: &str,
    fingerprint: &str,
) -> Result<String> {
    let url = format!(
        "https://api.keygen.sh/v1/accounts/{}/machines?limit=1&fingerprint={}",
        KEYGEN_ACCOUNT_ID, fingerprint
    );

    let res = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", product_token))
        .header("Accept", "application/vnd.api+json")
        .send()
        .await?;

    if !res.status().is_success() {
        return Err(ChroniclerError::LicenseInvalid(
            "Could not look up activated machine.".to_string(),
        ));
    }

    let parsed: KeygenMachineListResponse = res.json().await?;
    parsed.data.into_iter().next().map(|m| m.id).ok_or_else(|| {
        ChroniclerError::LicenseInvalid(
            "Activation state out of sync; please re-validate your license.".to_string(),
        )
    })
}

async fn check_out_machine(
    client: &reqwest::Client,
    product_token: &str,
    machine_id: &str,
) -> Result<String> {
    let url = format!(
        "https://api.keygen.sh/v1/accounts/{}/machines/{}/actions/check-out?include=license,license.entitlements",
        KEYGEN_ACCOUNT_ID, machine_id
    );

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", product_token))
        .header("Accept", "application/vnd.api+json")
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        error!("Machine check-out failed: {} {}", status, body);
        return Err(ChroniclerError::LicenseInvalid(
            "Could not retrieve signed license certificate.".to_string(),
        ));
    }

    let parsed: KeygenCertificateResponse = res.json().await?;
    Ok(parsed.data.attributes.certificate)
}

/// Verifies the Ed25519 signature on a Keygen-issued machine file, then
/// extracts the License from its payload. Also enforces that the certificate
/// is bound to this machine and is not past its TTL.
fn verify_certificate(certificate: &str, fingerprint: &str) -> Result<License> {
    // Strip the PEM-style markers and any whitespace/newlines.
    let body = certificate
        .replace("-----BEGIN MACHINE FILE-----", "")
        .replace("-----END MACHINE FILE-----", "");
    let body: String = body.split_whitespace().collect();

    let envelope_bytes = B64
        .decode(body.as_bytes())
        .map_err(|e| ChroniclerError::LicenseInvalid(format!("malformed certificate: {}", e)))?;
    let envelope: CertificateEnvelope = serde_json::from_slice(&envelope_bytes)
        .map_err(|e| ChroniclerError::LicenseInvalid(format!("malformed envelope: {}", e)))?;

    if envelope.alg != "base64+ed25519" {
        return Err(ChroniclerError::LicenseInvalid(format!(
            "unsupported signature algorithm: {}",
            envelope.alg
        )));
    }

    // Verify the signature over `"machine/<enc>"` with the embedded public key.
    let pk_bytes_vec = hex::decode(KEYGEN_PUBLIC_KEY)
        .map_err(|_| ChroniclerError::LicenseInvalid("invalid public key (hex)".to_string()))?;
    let pk_bytes: [u8; 32] = pk_bytes_vec
        .as_slice()
        .try_into()
        .map_err(|_| ChroniclerError::LicenseInvalid("invalid public key length".to_string()))?;
    let verifying_key = VerifyingKey::from_bytes(&pk_bytes)
        .map_err(|_| ChroniclerError::LicenseInvalid("invalid public key".to_string()))?;

    let sig_bytes = B64
        .decode(envelope.sig.as_bytes())
        .map_err(|_| ChroniclerError::LicenseInvalid("malformed signature".to_string()))?;
    let signature = Signature::try_from(sig_bytes.as_slice())
        .map_err(|_| ChroniclerError::LicenseInvalid("malformed signature".to_string()))?;

    let signing_data = format!("machine/{}", envelope.enc);
    verifying_key
        .verify_strict(signing_data.as_bytes(), &signature)
        .map_err(|_| {
            error!("LICENSE TAMPERING DETECTED — Ed25519 signature mismatch.");
            ChroniclerError::LicenseInvalid("license certificate signature is invalid".to_string())
        })?;

    // Signature is good — now we can trust the payload.
    let payload_bytes = B64
        .decode(envelope.enc.as_bytes())
        .map_err(|_| ChroniclerError::LicenseInvalid("malformed payload".to_string()))?;
    let payload: MachineFilePayload = serde_json::from_slice(&payload_bytes)
        .map_err(|e| ChroniclerError::LicenseInvalid(format!("malformed payload: {}", e)))?;

    if payload.data.attributes.fingerprint != fingerprint {
        warn!(
            cert_fp = %payload.data.attributes.fingerprint,
            local_fp = %fingerprint,
            "Certificate is bound to a different machine."
        );
        return Err(ChroniclerError::LicenseInvalid(
            "license is bound to a different machine".to_string(),
        ));
    }

    let mut license_id = String::new();
    let mut license_attrs: Option<LicenseAttrs> = None;
    let mut entitlements: Vec<String> = Vec::new();
    for inc in payload.included {
        match inc {
            IncludedResource::License { id, attributes } => {
                license_id = id;
                license_attrs = Some(attributes);
            }
            IncludedResource::Entitlement { attributes } => {
                entitlements.push(attributes.code);
            }
            IncludedResource::Other => {}
        }
    }

    let license_attrs = license_attrs.ok_or_else(|| {
        ChroniclerError::LicenseInvalid("certificate did not contain a license".to_string())
    })?;

    let mut status = license_attrs.status;
    if let Some(license_expiry) = license_attrs.expiry {
        if Utc::now() > license_expiry {
            status = "EXPIRED".to_string();
        }
    }

    Ok(License {
        id: license_id,
        key: license_attrs.key,
        status,
        expiry: license_attrs.expiry,
        entitlements,
    })
}

/// Persists the Keygen-issued certificate so it can be verified offline on
/// future launches. The `License` struct returned to the UI is always
/// re-derived from the certificate on load, so there's nothing here a
/// tamperer can forge.
pub fn save_license(app_handle: &AppHandle, validated: &ValidatedLicense) -> Result<()> {
    let stored = StoredLicense {
        version: STORED_LICENSE_VERSION,
        certificate: validated.certificate.clone(),
    };
    let license_path = app_handle.path().app_config_dir()?.join(LICENSE_FILE_NAME);
    let content = serde_json::to_string_pretty(&stored)?;
    atomic_write(&license_path, &content)?;
    info!("License certificate saved.");
    Ok(())
}

/// Loads the license from the config directory and verifies its embedded
/// Ed25519 signature.
pub fn load_and_verify_license(app_handle: &AppHandle) -> Result<Option<License>> {
    let license_path = app_handle.path().app_config_dir()?.join(LICENSE_FILE_NAME);
    if !license_path.exists() {
        return Ok(None);
    }

    let raw = std::fs::read_to_string(&license_path)?;
    let stored: StoredLicense = match serde_json::from_str::<StoredLicense>(&raw) {
        Ok(s) if s.version == STORED_LICENSE_VERSION => s,
        _ => {
            warn!("license.json is in legacy format; user must to re-validate.");
            return Ok(None);
        }
    };

    let fingerprint = machine_uid::get()
        .map_err(|e| ChroniclerError::LicenseInvalid(format!("Could not get machine ID: {}", e)))?;
    let license = verify_certificate(&stored.certificate, &fingerprint)?;
    info!(license_id = %license.id, "License certificate verified on load.");
    Ok(Some(license))
}
