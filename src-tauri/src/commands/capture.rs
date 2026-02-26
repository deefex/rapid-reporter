use crate::models::RegionSelection;
use chrono::Local;

/// Launches Windows Snipping Tool and imports the next clipboard image into a temp PNG file.
///
/// Returns `Ok(None)` when the user cancels or no clipboard image arrives before timeout.
#[tauri::command]
pub(crate) async fn capture_windows_snip_to_file(
    timeout_ms: Option<u64>,
) -> Result<Option<String>, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = timeout_ms;
        return Err("Windows snipping fallback is only available on Windows.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(move || {
            use std::path::PathBuf;
            use std::process::Command;
            use std::thread;
            use std::time::{Duration, Instant};
            use windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber;

            println!(
                "[rapid-reporter] windows snip fallback start (timeout_ms={})",
                timeout_ms.unwrap_or(45_000)
            );

            let mut clipboard = arboard::Clipboard::new().map_err(|e| {
                eprintln!("[rapid-reporter] clipboard init failed: {}", e);
                e.to_string()
            })?;

            let baseline_has_image = clipboard.get_image().is_ok();
            let baseline_seq = unsafe { GetClipboardSequenceNumber() };
            println!(
                "[rapid-reporter] clipboard baseline image present: {}",
                baseline_has_image
            );
            println!(
                "[rapid-reporter] clipboard baseline sequence: {}",
                baseline_seq
            );

            let explorer_result = Command::new("explorer.exe").arg("ms-screenclip:").spawn();
            match &explorer_result {
                Ok(_) => println!("[rapid-reporter] launch attempt explorer.exe ms-screenclip: OK"),
                Err(e) => eprintln!(
                    "[rapid-reporter] launch attempt explorer.exe ms-screenclip: FAILED ({})",
                    e
                ),
            }

            let cmd_result = if explorer_result.is_ok() {
                None
            } else {
                let r = Command::new("cmd")
                    .args(["/C", "start", "", "ms-screenclip:"])
                    .spawn();
                match &r {
                    Ok(_) => {
                        println!("[rapid-reporter] launch attempt cmd start ms-screenclip: OK")
                    }
                    Err(e) => eprintln!(
                        "[rapid-reporter] launch attempt cmd start ms-screenclip: FAILED ({})",
                        e
                    ),
                }
                Some(r)
            };

            let launched =
                explorer_result.is_ok() || cmd_result.as_ref().is_some_and(|r| r.is_ok());

            if !launched {
                eprintln!("[rapid-reporter] all launch attempts failed");
                return Err("Could not launch Windows Snipping Tool.".to_string());
            }

            let timeout = Duration::from_millis(timeout_ms.unwrap_or(45_000));
            let poll = Duration::from_millis(150);
            let started = Instant::now();
            println!(
                "[rapid-reporter] waiting for new clipboard image (poll={}ms, timeout={}ms)",
                poll.as_millis(),
                timeout.as_millis()
            );

            let mut saw_sequence_change = false;
            while started.elapsed() < timeout {
                let seq = unsafe { GetClipboardSequenceNumber() };
                if seq != baseline_seq {
                    if !saw_sequence_change {
                        println!(
                            "[rapid-reporter] clipboard sequence changed: {} -> {}",
                            baseline_seq, seq
                        );
                        saw_sequence_change = true;
                    }

                    if let Ok(img) = clipboard.get_image() {
                        let width = img.width as u32;
                        let height = img.height as u32;
                        let bytes = img.bytes.into_owned();

                        let out_dir = std::env::temp_dir().join("rapid-reporter");
                        std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

                        let millis = chrono::Local::now().timestamp_millis();
                        let out_path: PathBuf =
                            out_dir.join(format!("windows-snip-{}.png", millis));

                        image::save_buffer(
                            &out_path,
                            &bytes,
                            width,
                            height,
                            image::ColorType::Rgba8,
                        )
                        .map_err(|e| e.to_string())?;

                        println!(
                            "[rapid-reporter] snip captured from clipboard: {}x{} -> {}",
                            width,
                            height,
                            out_path.to_string_lossy()
                        );

                        return Ok(Some(out_path.to_string_lossy().to_string()));
                    } else if saw_sequence_change {
                        // Clipboard changed, but image payload is not readable yet.
                        // Continue polling briefly until it becomes available or timeout hits.
                    }
                }

                thread::sleep(poll);
            }

            println!("[rapid-reporter] snip fallback timed out waiting for clipboard image");
            Ok(None)
        })
        .await
        .map_err(|e| e.to_string())?
    }
}

/// Opens (or reuses) the region-selection overlay window positioned over the active monitor.
#[tauri::command]
pub(crate) fn open_region_overlay(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::{Manager, PhysicalPosition, PhysicalSize};

    fn size_to_main_monitor(
        app: &tauri::AppHandle,
        overlay: &tauri::WebviewWindow,
    ) -> Result<(), String> {
        if let Some(main) = app.get_webview_window("main") {
            if let Ok(Some(monitor)) = main.current_monitor() {
                let pos = monitor.position();
                let size = monitor.size();

                overlay
                    .set_position(PhysicalPosition::new(pos.x, pos.y))
                    .map_err(|e| e.to_string())?;
                overlay
                    .set_size(PhysicalSize::new(size.width, size.height))
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    if let Some(overlay) = app.get_webview_window("region_overlay") {
        size_to_main_monitor(&app, &overlay)?;
        overlay.show().map_err(|e| e.to_string())?;
        overlay.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let conf = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "region_overlay")
        .ok_or_else(|| "Missing window config for label 'region_overlay'.".to_string())?
        .clone();

    let overlay = tauri::WebviewWindowBuilder::from_config(&app, &conf)
        .map_err(|e: tauri::Error| e.to_string())?
        .build()
        .map_err(|e: tauri::Error| e.to_string())?;

    size_to_main_monitor(&app, &overlay)?;
    overlay.show().map_err(|e| e.to_string())?;
    overlay.set_focus().map_err(|e| e.to_string())?;

    Ok(())
}

/// Closes the region-selection overlay and notifies the main window to clear capture state.
#[tauri::command]
pub(crate) fn close_region_overlay(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::{Emitter, Manager};

    // Notify the main window that the overlay has been closed/cancelled
    // so the UI can clear any "Please wait…" state.
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("region-overlay-closed", ());
    } else {
        let _ = app.emit("region-overlay-closed", ());
    }

    if let Some(w) = app.get_webview_window("region_overlay") {
        let _ = w.close();
    }

    Ok(())
}

/// Sends the selected region back to the main window and closes the overlay.
#[tauri::command]
pub(crate) fn submit_region_selection(
    app: tauri::AppHandle,
    selection: RegionSelection,
) -> Result<(), String> {
    use tauri::{Emitter, Manager};

    if let Some(main) = app.get_webview_window("main") {
        main.emit("region-selected", selection.clone())
            .map_err(|e: tauri::Error| e.to_string())?;
    } else {
        app.emit("region-selected", selection.clone())
            .map_err(|e: tauri::Error| e.to_string())?;
    }

    if let Some(w) = app.get_webview_window("region_overlay") {
        let _ = w.close();
    }

    Ok(())
}

/// Crops a full screenshot image to the selected region and writes a new PNG beside the source.
#[tauri::command]
pub(crate) fn crop_screenshot(path: String, selection: RegionSelection) -> Result<String, String> {
    use image::GenericImageView;

    // We crop the PNG in physical pixels. Selection is in logical pixels, so scale by devicePixelRatio.
    let dpr = selection.device_pixel_ratio.max(1.0);

    let x = (selection.x as f64 * dpr).round().max(0.0) as u32;
    let y = (selection.y as f64 * dpr).round().max(0.0) as u32;
    let w = (selection.width as f64 * dpr).round().max(1.0) as u32;
    let h = (selection.height as f64 * dpr).round().max(1.0) as u32;

    let img = image::open(&path).map_err(|e| e.to_string())?;
    let (img_w, img_h) = img.dimensions();

    let x2 = (x + w).min(img_w);
    let y2 = (y + h).min(img_h);
    if x >= x2 || y >= y2 {
        return Err("Crop area is outside the image bounds.".to_string());
    }

    let cropped = img.crop_imm(x, y, x2 - x, y2 - y);

    let src = std::path::Path::new(&path);
    let parent = src
        .parent()
        .ok_or("Could not determine screenshot directory")?;
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("screenshot");
    let millis = Local::now().timestamp_millis();

    let out_path = parent.join(format!("{}-region-{}.png", stem, millis));
    cropped.save(&out_path).map_err(|e| e.to_string())?;

    Ok(out_path.to_string_lossy().to_string())
}
