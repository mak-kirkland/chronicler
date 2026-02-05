//! Application telemetry and analytics.
//!
//! Handles sending anonymous usage pings to the server.

use crate::error::Result;
use sha2::{Digest, Sha256};
use std::env;
use tracing::{info, warn};

// Read the salt at compile time from the environment variable provided by build.rs
// This ensures the salt is not visible in the source code, only in the compiled binary.
const TELEMETRY_SALT: &str = env!("CHRONICLER_ANALYTICS_SALT");

const ANALYTICS_ENDPOINT: &str = "https://chronicler.pro/api/chronicler-ping";

/// Sends an anonymous "I am alive" ping to the analytics server.
///
/// This function hashes the machine ID with a secret salt to ensure privacy.
/// It is designed to be fire-and-forget; it will log errors but not return them
/// to avoid disrupting the application startup.
pub async fn send_analytics_ping() -> Result<()> {
    // 1. Get the raw machine ID using the same method as licensing
    let raw_id = machine_uid::get().unwrap_or_else(|_| "unknown-machine".into());

    // 2. Hash it with the salt
    // This creates a unique identifier for Chronicler that cannot be
    // correlated with other applications or reversed to the raw ID.
    let mut hasher = Sha256::new();
    hasher.update(raw_id.as_bytes());
    hasher.update(TELEMETRY_SALT.as_bytes());
    let hashed_id = hex::encode(hasher.finalize());

    // 3. Send the Ping
    let client = reqwest::Client::new();
    let res = client
        .post(ANALYTICS_ENDPOINT)
        .json(&serde_json::json!({
            "user_hash": hashed_id,
            "app_version": env!("CARGO_PKG_VERSION"),
            "platform": std::env::consts::OS
        }))
        .timeout(std::time::Duration::from_secs(10)) // Short timeout to avoid hanging
        .send()
        .await;

    match res {
        Ok(response) => {
            if response.status().is_success() {
                info!("Daily active user ping sent successfully.");
            } else {
                warn!("Analytics ping failed with status: {}", response.status());
            }
        }
        Err(e) => warn!("Failed to send analytics ping: {}", e),
    }

    Ok(())
}
