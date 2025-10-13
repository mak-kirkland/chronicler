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

    // --- Handle LICENSE_SECRET ---
    if let Ok(secret) = std::env::var("LICENSE_SECRET") {
        println!("cargo:rustc-env=LICENSE_SECRET={}", secret);
    } else {
        println!("cargo:warning=❌ LICENSE_SECRET was not set in the build environment.");
    }
}
