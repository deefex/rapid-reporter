// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use chrono::{Local, TimeZone};
use serde::Deserialize;
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

fn copy_screenshot_asset(export_dir: &std::path::Path, absolute_path: &str) -> Result<String, String> {
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
    charter: String,
    duration_minutes: Option<i64>,
    started_at: i64,
    notes: Vec<Note>,
}

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
    md.push_str(&format!("Charter: {}\n\n", session.charter));

    // Append the date to the report as well as the time as this will be useful moving forward
    let tz_abbrev = started.format("%Z").to_string();
    let tz_display = if tz_abbrev == "+00:00" { "GMT" } else { &tz_abbrev };
    let date_display = started.format("%-d %B %Y").to_string();
    let time_display = started.format("%H:%M").to_string();
    let started_line = format!("{} {} {}", date_display, time_display, tz_display);
    md.push_str(&format!("Started: {}\n\n", started_line));

    if let Some(mins) = session.duration_minutes {
        md.push_str(&format!("Duration: {} minutes\n\n", mins));
    }

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
            unique_screenshot_copy,
            export_session_markdown
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}