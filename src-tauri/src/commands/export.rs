use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;

use crate::services::events::{AppEvent, ExportTaskEvent};
use crate::services::AppServices;

/// Export Markdown to the given format. Uses in-process Rust libraries only.
#[tauri::command]
pub async fn export_markdown(
  markdown: String,
  format: String,
  output_path: String,
  services: State<'_, AppServices>,
) -> Result<String, String> {
  let task_id = create_export_task_id(&format);
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
