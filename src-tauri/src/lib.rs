mod commands;
mod models;

/// Starts the Tauri application and registers all frontend-invokable commands.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_screenshots::init())
        .invoke_handler(tauri::generate_handler![
            commands::app::greet,
            commands::app::app_version,
            commands::app::platform_os,
            commands::app::unique_screenshot_copy,
            commands::export::export_session_markdown,
            commands::capture::open_region_overlay,
            commands::capture::close_region_overlay,
            commands::capture::submit_region_selection,
            commands::capture::crop_screenshot,
            commands::capture::capture_windows_snip_to_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
