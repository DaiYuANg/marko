use tauri::State;

use crate::services::AppServices;

/// Export Markdown to the given format. Uses in-process Rust libraries only.
#[tauri::command]
pub fn export_markdown(
  markdown: String,
  format: String,
  output_path: String,
  services: State<'_, AppServices>,
) -> Result<(), String> {
  services
    .export
    .export_markdown(&markdown, &format, &output_path)
}
