fn main() {
    tauri_build::build();

    if dotenvy::dotenv().is_err() {
        println!("cargo:warning=Could not find or load .env file. Release builds will rely on CI secrets.");
    }

    // --- Handle KEYGEN_PRODUCT_TOKEN ---
    if let Ok(token) = std::env::var("KEYGEN_PRODUCT_TOKEN") {
        println!("cargo:rustc-env=KEYGEN_PRODUCT_TOKEN={}", token);
    } else {
        println!("cargo:warning=❌ KEYGEN_PRODUCT_TOKEN was not set in the build environment.");
    }

    // --- Handle KEYGEN_PUBLIC_KEY ---
    // This is the *public* verification key for the Keygen account that
    // signs license certificates. It is NOT a secret - it can only verify
    // signatures, not produce them.
    if let Ok(pk) = std::env::var("KEYGEN_PUBLIC_KEY") {
        println!("cargo:rustc-env=KEYGEN_PUBLIC_KEY={}", pk);
    } else {
        println!(
            "cargo:warning=⚠️ KEYGEN_PUBLIC_KEY not set; license verification will fail at runtime."
        );
        // Compile-time placeholder so dev builds without licensing still
        // compile. Verification will reject every certificate against this.
        println!(
            "cargo:rustc-env=KEYGEN_PUBLIC_KEY=0000000000000000000000000000000000000000000000000000000000000000"
        );
    }

    // --- Handle CHRONICLER_ANALYTICS_SALT ---
    if let Ok(salt) = std::env::var("CHRONICLER_ANALYTICS_SALT") {
        println!("cargo:rustc-env=CHRONICLER_ANALYTICS_SALT={}", salt);
    } else {
        println!("cargo:warning=CHRONICLER_ANALYTICS_SALT not found. Using dev fallback.");
        // Fallback for local dev so compilation doesn't break
        println!("cargo:rustc-env=CHRONICLER_ANALYTICS_SALT=dev-salt-insecure-placeholder");
    }
}
