// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn unique_screenshot_copy(path: String) -> Result<String, String> {
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

    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_screenshots::init())
        .invoke_handler(tauri::generate_handler![greet, unique_screenshot_copy])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
