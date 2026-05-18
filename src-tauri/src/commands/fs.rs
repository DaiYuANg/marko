use tauri::{Manager, State};

use crate::commands::fs_runtime::{emit_buffer_status, emit_buffer_statuses, set_background_task};
pub use crate::commands::fs_runtime::{start_buffer_flush_worker, start_fs_watcher};
use crate::models::{BackgroundTaskStatus, FsBufferStatus, FsRootInfo};
use crate::services::events::AppEvent;
use crate::state::{BackgroundTasksState, FsBufferState, FsState, FsWatcherState};

pub use crate::services::workspace::ensure_default_file;

#[tauri::command]
pub fn fs_get_root_info(
  state: State<'_, FsState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<FsRootInfo, String> {
  services.workspace.root_info(&state)
}

#[tauri::command]
pub async fn fs_get_snapshot(
  state: State<'_, FsState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<crate::models::FsSnapshot, String> {
  services.workspace.snapshot(&state).await
}

#[tauri::command]
pub async fn fs_set_root(
  path: Option<String>,
  state: State<'_, FsState>,
  watcher_state: State<'_, FsWatcherState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<FsRootInfo, String> {
  let root_info = services
    .workspace
    .set_root(path, &state, &buffer_state)
    .await?;
  start_fs_watcher(&app, &state, &watcher_state)?;
  publish_app_event(&services, AppEvent::WorkspaceChanged)?;
  Ok(root_info)
}

#[tauri::command]
pub async fn fs_set_single_file(
  path: String,
  state: State<'_, FsState>,
  watcher_state: State<'_, FsWatcherState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<FsRootInfo, String> {
  let root_info = services
    .workspace
    .set_single_file(path, &state, &buffer_state)
    .await?;
  start_fs_watcher(&app, &state, &watcher_state)?;
  publish_app_event(&services, AppEvent::WorkspaceChanged)?;
  Ok(root_info)
}

#[tauri::command]
pub async fn fs_list_entries(
  state: State<'_, FsState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<Vec<crate::models::FsEntry>, String> {
  services.workspace.list_entries(&state).await
}

#[tauri::command]
pub async fn fs_read_file(
  path: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<String, String> {
  services
    .workspace
    .read_file(&path, &state, &buffer_state)
    .await
}

#[tauri::command]
pub async fn fs_get_workspace_index(
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<crate::models::FsWorkspaceIndex, String> {
  services
    .workspace
    .workspace_index(&state, &buffer_state)
    .await
}

#[tauri::command]
pub async fn fs_get_workspace_graph(
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<crate::models::FsGraph, String> {
  services
    .workspace
    .workspace_graph(&state, &buffer_state)
    .await
}

#[tauri::command]
pub async fn fs_get_outline_graph(
  path: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<crate::models::FsGraph, String> {
  services
    .workspace
    .outline_graph(&path, &state, &buffer_state)
    .await
}

#[tauri::command]
pub async fn fs_analyze_markdown_buffer(
  path: String,
  content: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<Vec<crate::models::FsMarkdownDiagnostic>, String> {
  services
    .workspace
    .analyze_markdown_buffer(path, content, &state, &buffer_state)
    .await
}

#[tauri::command]
pub async fn fs_search_workspace(
  query: String,
  limit: Option<usize>,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<Vec<crate::models::FsSearchResult>, String> {
  let index_parent = search_index_parent(&app)?;
  services
    .workspace
    .search_workspace(
      index_parent,
      query,
      limit.unwrap_or(20),
      &state,
      &buffer_state,
    )
    .await
}

#[tauri::command]
pub async fn fs_rebuild_search_index(
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let index_parent = search_index_parent(&app)?;
  services
    .workspace
    .rebuild_search_index(index_parent, &state, &buffer_state)
    .await
}

#[tauri::command]
pub async fn fs_open_file(
  path: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<String, String> {
  services
    .workspace
    .open_file(&path, &state, &buffer_state)
    .await
}

#[tauri::command]
pub fn fs_update_buffer(
  path: String,
  content: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<FsBufferStatus, String> {
  let status = services
    .workspace
    .update_buffer(&path, &content, &state, &buffer_state)?;
  emit_buffer_status(&app, &status)?;
  if status.dirty {
    publish_app_event(&services, AppEvent::DocumentChanged)?;
  }
  Ok(status)
}

#[tauri::command]
pub async fn fs_flush_buffers(
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  task_state: State<'_, BackgroundTasksState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<usize, String> {
  set_background_task(&task_state, "buffer-flush", "Save queue", "running", None)?;
  let statuses = match services
    .workspace
    .flush_buffers(&state, &buffer_state)
    .await
  {
    Ok(statuses) => statuses,
    Err(err) => {
      let _ = set_background_task(
        &task_state,
        "buffer-flush",
        "Save queue",
        "error",
        Some(err.clone()),
      );
      return Err(err);
    }
  };
  emit_buffer_statuses(&app, &statuses)?;
  publish_app_event(&services, AppEvent::BuffersFlushed)?;
  set_background_task(&task_state, "buffer-flush", "Save queue", "idle", None)?;
  Ok(statuses.len())
}

#[tauri::command]
pub fn fs_get_buffer_status(
  path: String,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<Option<FsBufferStatus>, String> {
  services.documents.status(&buffer_state, &path)
}

#[tauri::command]
pub fn fs_get_background_tasks(
  task_state: State<'_, BackgroundTasksState>,
) -> Result<Vec<BackgroundTaskStatus>, String> {
  let tasks = task_state
    .0
    .lock()
    .map_err(|_| "Failed to lock task state")?;
  Ok(tasks.values().cloned().collect())
}

#[tauri::command]
pub async fn fs_get_path_metadata(
  path: String,
  state: State<'_, FsState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<crate::models::FsPathMetadata, String> {
  services.workspace.path_metadata(path, &state).await
}

// Kept for backward compatibility with old frontend calls.
#[tauri::command]
pub async fn fs_write_file(
  path: String,
  content: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<(), String> {
  services
    .workspace
    .write_file_buffered(&path, &content, &state, &buffer_state)
}

#[tauri::command]
pub async fn fs_create_file(
  path: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<(), String> {
  services
    .workspace
    .create_file(path, &state, &buffer_state)
    .await?;
  publish_app_event(&services, AppEvent::FileSystemChanged)?;
  Ok(())
}

#[tauri::command]
pub async fn fs_create_dir(
  path: String,
  state: State<'_, FsState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<(), String> {
  services.workspace.create_dir(path, &state).await?;
  publish_app_event(&services, AppEvent::FileSystemChanged)?;
  Ok(())
}

#[tauri::command]
pub async fn fs_delete_path(
  path: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<(), String> {
  services
    .workspace
    .delete_path(path, &state, &buffer_state)
    .await?;
  publish_app_event(&services, AppEvent::FileSystemChanged)?;
  Ok(())
}

#[tauri::command]
pub async fn fs_rename_path(
  from: String,
  to: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<(), String> {
  services
    .workspace
    .rename_path(from, to, &state, &buffer_state)
    .await?;
  publish_app_event(&services, AppEvent::FileSystemChanged)?;
  Ok(())
}

fn publish_app_event(
  services: &crate::services::AppServices,
  event: AppEvent,
) -> Result<(), String> {
  services.events.publish(event)
}

fn search_index_parent(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
  app
    .path()
    .app_data_dir()
    .map_err(|err| format!("Failed to resolve app data dir: {err}"))
}

pub fn flush_all_buffers(state: &FsState, buffer_state: &FsBufferState) -> Result<usize, String> {
  Ok(flush_all_buffers_with_status(state, buffer_state)?.len())
}

fn flush_all_buffers_with_status(
  state: &FsState,
  buffer_state: &FsBufferState,
) -> Result<Vec<FsBufferStatus>, String> {
  crate::services::document_store::flush_all_documents_with_status(state, buffer_state)
}
