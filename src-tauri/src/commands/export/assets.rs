/// Copies bundled icon assets into the export folder so the markdown report is portable.
pub(crate) fn copy_icon_assets(export_dir: &std::path::Path) -> Result<(), String> {
    // Embed icons at compile time so export works in dev + packaged builds.
    const BUG: &[u8] = include_bytes!("../../../assets/icons/bug.png");
    const IDEA: &[u8] = include_bytes!("../../../assets/icons/idea.png");
    const OBSERVATION: &[u8] = include_bytes!("../../../assets/icons/observation.png");
    const QUESTION: &[u8] = include_bytes!("../../../assets/icons/question.png");
    const WARNING: &[u8] = include_bytes!("../../../assets/icons/warning.png");

    let dest_dir = export_dir.join("assets/icons");
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    std::fs::write(dest_dir.join("bug.png"), BUG).map_err(|e| e.to_string())?;
    std::fs::write(dest_dir.join("idea.png"), IDEA).map_err(|e| e.to_string())?;
    std::fs::write(dest_dir.join("observation.png"), OBSERVATION).map_err(|e| e.to_string())?;
    std::fs::write(dest_dir.join("question.png"), QUESTION).map_err(|e| e.to_string())?;
    std::fs::write(dest_dir.join("warning.png"), WARNING).map_err(|e| e.to_string())?;

    Ok(())
}

/// Copies a captured screenshot into the export folder and returns a markdown-friendly relative path.
pub(crate) fn copy_screenshot_asset(
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
