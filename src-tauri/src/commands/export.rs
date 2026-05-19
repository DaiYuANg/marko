use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use path_clean::PathClean;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::services::events::{AppEvent, ExportTaskEvent};
use crate::services::AppServices;
use crate::state::AllowedSystemPathsState;

/// Export Markdown to the given format. Uses in-process Rust libraries only.
#[tauri::command]
pub async fn export_markdown(
  markdown: String,
  format: String,
  output_path: String,
  services: State<'_, AppServices>,
  allowed_paths: State<'_, AllowedSystemPathsState>,
) -> Result<String, String> {
  let task_id = create_export_task_id(&format);
  allow_export_output_path(&output_path, &allowed_paths)?;
  publish_export_event(&services, &task_id, &format, &output_path, "started", None);

  let task_services = services.inner().clone();
  let task_id_for_worker = task_id.clone();
  let format_for_worker = format.clone();
  let output_path_for_worker = output_path.clone();

  tauri::async_runtime::spawn(async move {
    let result = task_services
      .export
      .export_markdown_blocking(
        markdown,
        format_for_worker.clone(),
        output_path_for_worker.clone(),
      )
      .await;

    match result {
      Ok(()) => {
        publish_export_event(
          &task_services,
          &task_id_for_worker,
          &format_for_worker,
          &output_path_for_worker,
          "finished",
          None,
        );
      }
      Err(err) => {
        publish_export_event(
          &task_services,
          &task_id_for_worker,
          &format_for_worker,
          &output_path_for_worker,
          "failed",
          Some(err),
        );
      }
    }
  });

  Ok(task_id)
}

#[tauri::command]
pub async fn export_open_output_path(
  path: String,
  allowed_paths: State<'_, AllowedSystemPathsState>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let normalized = normalize_system_path(&path)?;
  let allowed = allowed_paths
    .0
    .lock()
    .map_err(|_| "Failed to lock allowed export paths".to_string())?
    .contains(&normalized);
  if !allowed {
    return Err("Path was not selected by the export dialog".to_string());
  }

  app
    .opener()
    .open_path(normalized.to_string_lossy().to_string(), None::<String>)
    .map_err(|err| format!("Failed to open exported file: {err}"))
}

fn create_export_task_id(format: &str) -> String {
  let millis = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis())
    .unwrap_or_default();
  format!("export-{format}-{millis}")
}

fn publish_export_event(
  services: &AppServices,
  id: &str,
  format: &str,
  output_path: &str,
  status: &str,
  message: Option<String>,
) {
  if let Err(err) = services
    .events
    .publish(AppEvent::ExportTask(ExportTaskEvent {
      id: id.to_string(),
      format: format.to_string(),
      output_path: output_path.to_string(),
      status: status.to_string(),
      message,
    }))
  {
    log::warn!("publish export task event failed: {err}");
  }
}

fn allow_export_output_path(
  output_path: &str,
  allowed_paths: &AllowedSystemPathsState,
) -> Result<(), String> {
  let normalized = normalize_system_path(output_path)?;
  allowed_paths
    .0
    .lock()
    .map_err(|_| "Failed to lock allowed export paths".to_string())?
    .insert(normalized);
  Ok(())
}

fn normalize_system_path(path: &str) -> Result<PathBuf, String> {
  let path = PathBuf::from(path);
  if !path.is_absolute() {
    return Err("System path must be absolute".to_string());
  }

  if path.exists() {
    return std::fs::canonicalize(&path)
      .map(|path| path.clean())
      .map_err(|err| format!("Failed to resolve path: {err}"));
  }

  let parent = path
    .parent()
    .ok_or_else(|| "System path must have a parent directory".to_string())?;
  let file_name = path
    .file_name()
    .ok_or_else(|| "System path must include a file name".to_string())?;
  let parent =
    std::fs::canonicalize(parent).map_err(|err| format!("Failed to resolve parent path: {err}"))?;
  Ok(parent.join(file_name).clean())
}
