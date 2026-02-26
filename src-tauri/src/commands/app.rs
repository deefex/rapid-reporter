/// Simple starter command kept for Tauri template parity and smoke checks.
#[tauri::command]
pub(crate) fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Returns the application version from Cargo package metadata.
#[tauri::command]
pub(crate) fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Returns the current target OS as a short string (e.g. `windows`, `macos`).
#[tauri::command]
pub(crate) fn platform_os() -> String {
    std::env::consts::OS.to_string()
}

/// Creates a unique copy of an existing screenshot file next to the original.
///
/// This avoids filename collisions when the screenshot plugin reuses file names.
#[tauri::command]
pub(crate) fn unique_screenshot_copy(path: String) -> Result<String, String> {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    let src = PathBuf::from(&path);
    if !src.exists() {
        return Err(format!("Source file does not exist: {}", path));
    }

    let parent = src
        .parent()
        .ok_or_else(|| "Could not determine screenshot directory".to_string())?;

    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("screenshot");

    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("png");

    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let mut dst = parent.join(format!("{}-{}.{}", stem, millis, ext));

    // Extremely unlikely, but ensure uniqueness if called multiple times in the same millisecond.
    let mut counter = 1u32;
    while dst.exists() {
        dst = parent.join(format!("{}-{}-{}.{}", stem, millis, counter, ext));
        counter += 1;
    }

    fs::copy(&src, &dst).map_err(|e| e.to_string())?;

    Ok(dst.to_string_lossy().to_string())
}
