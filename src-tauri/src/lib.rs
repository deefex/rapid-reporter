// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use chrono::{Local, TimeZone};
use serde::{Deserialize, Serialize};
use std::fs;

fn copy_icon_assets(export_dir: &std::path::Path) -> Result<(), String> {
    // Embed icons at compile time so export works in dev + packaged builds
    const BUG: &[u8] = include_bytes!("../assets/icons/bug.png");
    const IDEA: &[u8] = include_bytes!("../assets/icons/idea.png");
    const OBSERVATION: &[u8] = include_bytes!("../assets/icons/observation.png");
    const QUESTION: &[u8] = include_bytes!("../assets/icons/question.png");
    const WARNING: &[u8] = include_bytes!("../assets/icons/warning.png");

    let dest_dir = export_dir.join("assets/icons");
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    std::fs::write(dest_dir.join("bug.png"), BUG).map_err(|e| e.to_string())?;
    std::fs::write(dest_dir.join("idea.png"), IDEA).map_err(|e| e.to_string())?;
    std::fs::write(dest_dir.join("observation.png"), OBSERVATION).map_err(|e| e.to_string())?;
    std::fs::write(dest_dir.join("question.png"), QUESTION).map_err(|e| e.to_string())?;
    std::fs::write(dest_dir.join("warning.png"), WARNING).map_err(|e| e.to_string())?;

    Ok(())
}

fn copy_screenshot_asset(
    export_dir: &std::path::Path,
    absolute_path: &str,
) -> Result<String, String> {
    let src = std::path::Path::new(absolute_path);
    if !src.exists() {
        return Err(format!("Screenshot file does not exist: {}", absolute_path));
    }

    let filename = src
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Could not determine screenshot filename".to_string())?;

    let dest_dir = export_dir.join("assets/screenshots");
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let dest_path = dest_dir.join(filename);
    std::fs::copy(src, &dest_path).map_err(|e| e.to_string())?;

    Ok(format!("assets/screenshots/{}", filename))
}


#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn platform_os() -> String {
    std::env::consts::OS.to_string()
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

#[tauri::command]
fn capture_windows_snip_to_file(timeout_ms: Option<u64>) -> Result<Option<String>, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = timeout_ms;
        return Err("Windows snipping fallback is only available on Windows.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        use std::path::PathBuf;
        use std::process::Command;
        use std::thread;
        use std::time::{Duration, Instant};

        fn image_fingerprint(img: &arboard::ImageData<'_>) -> (usize, usize, u64) {
            let mut hasher = DefaultHasher::new();
            img.bytes.hash(&mut hasher);
            (img.width, img.height, hasher.finish())
        }

        println!(
            "[rapid-reporter] windows snip fallback start (timeout_ms={})",
            timeout_ms.unwrap_or(45_000)
        );

        let mut clipboard = arboard::Clipboard::new().map_err(|e| {
            eprintln!("[rapid-reporter] clipboard init failed: {}", e);
            e.to_string()
        })?;

        let baseline = clipboard.get_image().ok().map(|img| image_fingerprint(&img));
        println!(
            "[rapid-reporter] clipboard baseline image present: {}",
            baseline.is_some()
        );

        let explorer_result = Command::new("explorer.exe")
            .arg("ms-screenclip:")
            .spawn();
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
                Ok(_) => println!("[rapid-reporter] launch attempt cmd start ms-screenclip: OK"),
                Err(e) => eprintln!(
                    "[rapid-reporter] launch attempt cmd start ms-screenclip: FAILED ({})",
                    e
                ),
            }
            Some(r)
        };

        let launched = explorer_result.is_ok() || cmd_result.as_ref().is_some_and(|r| r.is_ok());

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

        while started.elapsed() < timeout {
            if let Ok(img) = clipboard.get_image() {
                let fp = image_fingerprint(&img);
                if baseline.as_ref() != Some(&fp) {
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
                }
            }

            thread::sleep(poll);
        }

        println!("[rapid-reporter] snip fallback timed out waiting for clipboard image");
        Ok(None)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Note {
    text: String,

    #[serde(rename = "type")]
    note_type: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    #[serde(default)]
    tester_name: Option<String>,
    charter: String,
    duration_minutes: Option<i64>,
    started_at: i64,
    notes: Vec<Note>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct RegionSelection {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    device_pixel_ratio: f64,

    // Optional for forward-compat (your current TS payload does not send it)
    #[serde(default)]
    monitor_id: Option<i32>,
}

/// Counts icon-related notes in a session.
///
/// Only the following note types are considered:
/// - "bug"
/// - "idea"
/// - "observation"
/// - "question"
/// - "warning"
///
/// Matching is case-insensitive.
/// All other note types (e.g. "test", "snippet", "screenshot") are ignored.
///
/// Returns a tuple in the order:
/// (bug, idea, observation, question, warning)

fn summary_counts(notes: &[Note]) -> (usize, usize, usize, usize, usize) {
    let mut bug_count = 0usize;
    let mut idea_count = 0usize;
    let mut observation_count = 0usize;
    let mut question_count = 0usize;
    let mut warning_count = 0usize;

    for note in notes {
        match note.note_type.to_lowercase().as_str() {
            "bug" => bug_count += 1,
            "idea" => idea_count += 1,
            "observation" => observation_count += 1,
            "question" => question_count += 1,
            "warning" => warning_count += 1,
            _ => {}
        }
    }

    (bug_count, idea_count, observation_count, question_count, warning_count)
}

fn plural(count: usize, singular: &str, plural: &str) -> String {
    if count == 1 {
        format!("{} {}", count, singular)
    } else {
        format!("{} {}", count, plural)
    }
}

/// Builds the Markdown `## Summary` section for icon-related notes.
///
/// The summary:
/// - Includes only note types that are present.
/// - Uses singular/plural labels appropriately (e.g. "1 Bug", "2 Bugs").
/// - Is omitted entirely if no icon-related notes exist.
///
/// The generated HTML references icons using relative paths:
/// `assets/icons/<icon>.png`.

fn build_summary_section(notes: &[Note]) -> Option<String> {
    let (bug_count, idea_count, observation_count, question_count, warning_count) =
        summary_counts(notes);

    let has_summary = bug_count > 0
        || idea_count > 0
        || observation_count > 0
        || question_count > 0
        || warning_count > 0;

    if !has_summary {
        return None;
    }

    let mut md = String::new();
    md.push_str("## Summary\n\n");

    if bug_count > 0 {
        md.push_str(&format!(
            "<img src=\"assets/icons/bug.png\" width=\"50\" valign=\"middle\"> {}\n\n",
            plural(bug_count, "Bug", "Bugs")
        ));
    }

    if idea_count > 0 {
        md.push_str(&format!(
            "<img src=\"assets/icons/idea.png\" width=\"50\" valign=\"middle\"> {}\n\n",
            plural(idea_count, "Idea", "Ideas")
        ));
    }

    if observation_count > 0 {
        md.push_str(&format!(
            "<img src=\"assets/icons/observation.png\" width=\"50\" valign=\"middle\"> {}\n\n",
            plural(observation_count, "Observation", "Observations")
        ));
    }

    if question_count > 0 {
        md.push_str(&format!(
            "<img src=\"assets/icons/question.png\" width=\"50\" valign=\"middle\"> {}\n\n",
            plural(question_count, "Question", "Questions")
        ));
    }

    if warning_count > 0 {
        md.push_str(&format!(
            "<img src=\"assets/icons/warning.png\" width=\"50\" valign=\"middle\"> {}\n\n",
            plural(warning_count, "Warning", "Warnings")
        ));
    }

    Some(md)
}

/// Exports a session to a Markdown file in the user's home directory.
///
/// The export directory is named:
/// `RapidReporter-YYYY-MM-DD-HHMM`
///
/// The generated report includes:
/// - Session metadata (Tester, Charter, Started, Duration)
/// - An optional Summary section
/// - All notes (oldest-first)
/// - Embedded screenshots copied into `assets/screenshots`
///
/// Returns a map containing the key:
/// - "markdownPath": Absolute path to the generated file.

#[tauri::command]
fn export_session_markdown(
    session: Session,
) -> Result<std::collections::HashMap<String, String>, String> {
    use std::collections::HashMap;

    // Determine export directory in user's home folder
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;

    let started = Local
        .timestamp_millis_opt(session.started_at)
        .single()
        .ok_or("Invalid session startedAt timestamp")?;

    let stamp = started.format("%Y-%m-%d-%H%M").to_string();

    let export_dir = home.join(format!("RapidReporter-{}", stamp));
    fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    // Copy icon assets into export folder so the report is portable
    copy_icon_assets(&export_dir)?;

    let md_path = export_dir.join(format!("RapidReporter-{}.md", stamp));

    // Build Markdown content
    let mut md = String::new();

    md.push_str("# Rapid Reporter Session\n\n");

    if let Some(tester_display) = session
        .tester_name
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        md.push_str(&format!("- **Tester**: {}\n", tester_display));
    }

    md.push_str(&format!("- **Charter**: {}\n", session.charter.trim()));

    // Append the date to the report as well as the time as this will be useful moving forward
    let tz_abbrev = started.format("%Z").to_string();
    let tz_display = if tz_abbrev == "+00:00" { "GMT" } else { &tz_abbrev };
    let date_display = started.format("%-d %B %Y").to_string();
    let time_display = started.format("%H:%M").to_string();
    let started_line = format!("{} {} {}", date_display, time_display, tz_display);
    md.push_str(&format!("- **Started**: {}\n", started_line));

    if let Some(mins) = session.duration_minutes {
        md.push_str(&format!("- **Duration**: {} minutes\n", mins));
    }

    md.push_str("\n");

    // ----------------------------
    // Summary (icon-related notes only)
    // ----------------------------

    if let Some(summary_md) = build_summary_section(&session.notes) {
        md.push_str(&summary_md);
    }

    // ----------------------------
    // Notes section
    // ----------------------------

    md.push_str("## Notes\n\n");

    // Notes are stored newest-first on the frontend; export oldest-first.
    for note in session.notes.iter().rev() {
        let text = note.text.trim();
        let note_type_lc = note.note_type.to_lowercase();

        // Screenshot notes export as embedded images.
        // New format: note.type == "screenshot" and note.text is the absolute path.
        // Back-compat: note.text starts with "Screenshot:".
        let abs_path_opt: Option<String> = if note_type_lc == "screenshot" {
            Some(text.to_string())
        } else if let Some(rest) = text.strip_prefix("Screenshot:") {
            Some(rest.trim().to_string())
        } else {
            None
        };

        if let Some(abs_path) = abs_path_opt {
            match copy_screenshot_asset(&export_dir, &abs_path) {
                Ok(rel_path) => {
                    md.push_str(&format!(
                        "<img src=\"{}\" width=\"900\" alt=\"Screenshot\">\n\n",
                        rel_path
                    ));
                }
                Err(err) => {
                    // Fall back to a readable line so we don't lose information
                    md.push_str(&format!("Screenshot (copy failed): {}\n\n", abs_path));
                    md.push_str(&format!("<!-- {} -->\n\n", err.replace("--", "- -")));
                }
            }

            continue;
        }

        // Snippet notes export as fenced code blocks with no icon
        if note_type_lc == "snippet" {
            md.push_str("```\n");
            md.push_str(text);
            md.push_str("\n```\n\n");
            continue;
        }

        let icon_filename = match note_type_lc.as_str() {
            "bug" => Some("bug.png"),
            "warning" => Some("warning.png"),
            "observation" => Some("observation.png"),
            "question" => Some("question.png"),
            "idea" => Some("idea.png"),
            _ => None,
        };

        if let Some(icon_file) = icon_filename {
            md.push_str(&format!(
                "<img src=\"assets/icons/{}\" width=\"50\" valign=\"middle\"> {}\n\n",
                icon_file,
                text
            ));
        } else {
            md.push_str(&format!("{}\n\n", text));
        }
    }

    // ----------------------------
    // Version footer
    // ----------------------------

    let version = env!("CARGO_PKG_VERSION");
    md.push_str("---\n");
    md.push_str(&format!("Generated by Rapid Reporter v{}\n", version));

    fs::write(&md_path, md).map_err(|e| e.to_string())?;

    let mut result = HashMap::new();
    result.insert(
        "markdownPath".to_string(),
        md_path.to_string_lossy().to_string(),
    );

    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_screenshots::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            app_version,
            platform_os,
            unique_screenshot_copy,
            export_session_markdown,
            open_region_overlay,
            close_region_overlay,
            submit_region_selection,
            crop_screenshot,
            capture_windows_snip_to_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn open_region_overlay(app: tauri::AppHandle) -> Result<(), String> {
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

#[tauri::command]
fn close_region_overlay(app: tauri::AppHandle) -> Result<(), String> {
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

#[tauri::command]
fn submit_region_selection(app: tauri::AppHandle, selection: RegionSelection) -> Result<(), String> {
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

#[tauri::command]
fn crop_screenshot(path: String, selection: RegionSelection) -> Result<String, String> {
    use image::GenericImageView;

    // We crop the PNG in physical pixels. Selection is in logical pixels, so scale by devicePixelRatio.
    let dpr = selection.device_pixel_ratio.max(1.0);

    let x = (selection.x as f64 * dpr).round().max(0.0) as u32;
    let y = (selection.y as f64 * dpr).round().max(0.0) as u32;
    let w = (selection.width as f64 * dpr).round().max(1.0) as u32;
    let h = (selection.height as f64 * dpr).round().max(1.0) as u32;

    // Load image
    let img = image::open(&path).map_err(|e| e.to_string())?;
    let (img_w, img_h) = img.dimensions();

    // Clamp crop rectangle
    let x2 = (x + w).min(img_w);
    let y2 = (y + h).min(img_h);
    if x >= x2 || y >= y2 {
        return Err("Crop area is outside the image bounds.".to_string());
    }

    let cropped = img.crop_imm(x, y, x2 - x, y2 - y);

    // Write alongside the original screenshot
    let src = std::path::Path::new(&path);
    let parent = src.parent().ok_or("Could not determine screenshot directory")?;
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("screenshot");
    let millis = Local::now().timestamp_millis();

    let out_path = parent.join(format!("{}-region-{}.png", stem, millis));
    cropped.save(&out_path).map_err(|e| e.to_string())?;

    Ok(out_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(note_type: &str, text: &str) -> Note {
        Note {
            note_type: note_type.to_string(),
            text: text.to_string(),
        }
    }

    #[test]
    fn summary_counts_only_icon_types() {
        let notes = vec![
            note("bug", "b1"),
            note("bug", "b2"),
            note("idea", "i1"),
            note("test", "t1"),
            note("screenshot", "/tmp/x.png"),
            note("warning", "w1"),
        ];

        let (bug, idea, obs, q, warn) = summary_counts(&notes);
        assert_eq!(bug, 2);
        assert_eq!(idea, 1);
        assert_eq!(obs, 0);
        assert_eq!(q, 0);
        assert_eq!(warn, 1);
    }

    #[test]
    fn build_summary_section_is_none_when_no_icon_notes() {
        let notes = vec![
            note("test", "some test note"),
            note("snippet", "let x = 1;"),
            note("screenshot", "/tmp/x.png"),
        ];

        assert!(build_summary_section(&notes).is_none());
    }

    #[test]
    fn build_summary_section_includes_only_present_types_and_pluralises() {
        let notes = vec![
            note("bug", "b1"),
            note("bug", "b2"),
            note("idea", "i1"),
            note("question", "q1"),
            note("warning", "w1"),
            note("warning", "w2"),
            note("warning", "w3"),
        ];

        let md = build_summary_section(&notes).expect("summary should exist");
        assert!(md.contains("## Summary"));

        // present types
        assert!(md.contains("assets/icons/bug.png"));
        assert!(md.contains("2 Bugs"));

        assert!(md.contains("assets/icons/idea.png"));
        assert!(md.contains("1 Idea"));

        assert!(md.contains("assets/icons/question.png"));
        assert!(md.contains("1 Question"));

        assert!(md.contains("assets/icons/warning.png"));
        assert!(md.contains("3 Warnings"));

        // absent type (observation)
        assert!(!md.contains("assets/icons/observation.png"));
    }

    #[test]
    fn summary_is_case_insensitive() {
        let notes = vec![
            note("Bug", "b1"),
            note("BUG", "b2"),
            note("Idea", "i1"),
            note("WARNING", "w1"),
        ];

        let (bug, idea, obs, q, warn) = summary_counts(&notes);

        assert_eq!(bug, 2);
        assert_eq!(idea, 1);
        assert_eq!(obs, 0);
        assert_eq!(q, 0);
        assert_eq!(warn, 1);

        let md = build_summary_section(&notes).expect("summary should exist");

        // Ensure pluralisation still correct
        assert!(md.contains("2 Bugs"));
        assert!(md.contains("1 Idea"));
        assert!(md.contains("1 Warning"));
    }
}
