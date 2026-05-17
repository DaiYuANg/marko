use std::path::{Path, PathBuf};
use std::time::Duration;

use notify::{event::ModifyKind, Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{Emitter, Manager, State};
use tokio::runtime::Handle;
use tokio::sync::mpsc;

use crate::models::{FsBufferStatus, FsRootInfo};
use crate::state::{FsBufferState, FsState, FsWatcherState};

pub use crate::services::workspace::ensure_default_file;

const BUFFER_FLUSH_INTERVAL_MS: u64 = 1200;

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
  emit_fs_changed_async(&app, &state, &services).await?;
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
  emit_fs_changed_async(&app, &state, &services).await?;
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
  Ok(status)
}

#[tauri::command]
pub async fn fs_flush_buffers(
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<usize, String> {
  let statuses = services
    .workspace
    .flush_buffers(&state, &buffer_state)
    .await?;
  emit_buffer_statuses(&app, &statuses)?;
  Ok(statuses.len())
}

#[tauri::command]
pub fn fs_get_buffer_status(
  path: String,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<Option<FsBufferStatus>, String> {
  services.fs_buffer.status(&buffer_state, &path)
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
  app: tauri::AppHandle,
) -> Result<(), String> {
  services
    .workspace
    .create_file(path, &state, &buffer_state)
    .await?;
  emit_fs_changed_async(&app, &state, &services).await?;
  Ok(())
}

#[tauri::command]
pub async fn fs_create_dir(
  path: String,
  state: State<'_, FsState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  services.workspace.create_dir(path, &state).await?;
  emit_fs_changed_async(&app, &state, &services).await?;
  Ok(())
}

#[tauri::command]
pub async fn fs_delete_path(
  path: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  services
    .workspace
    .delete_path(path, &state, &buffer_state)
    .await?;
  emit_fs_changed_async(&app, &state, &services).await?;
  Ok(())
}

#[tauri::command]
pub async fn fs_rename_path(
  from: String,
  to: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  services
    .workspace
    .rename_path(from, to, &state, &buffer_state)
    .await?;
  emit_fs_changed_async(&app, &state, &services).await?;
  Ok(())
}

pub fn start_fs_watcher(
  app: &tauri::AppHandle,
  state: &FsState,
  watcher_state: &FsWatcherState,
) -> Result<(), String> {
  let root_path = {
    let data = state.0.read().map_err(|_| "Failed to lock fs state")?;
    data.root_path.clone()
  };
  if !root_path.exists() {
    return Ok(());
  }

  let (watch_path, mode) = if root_path.is_file() {
    (
      root_path
        .parent()
        .ok_or_else(|| "Failed to resolve parent directory".to_string())?
        .to_path_buf(),
      RecursiveMode::NonRecursive,
    )
  } else {
    (root_path, RecursiveMode::Recursive)
  };

  let (tx, mut rx) = mpsc::unbounded_channel();
  let mut watcher: RecommendedWatcher = RecommendedWatcher::new(
    move |result| {
      let _ = tx.send(result);
    },
    Config::default(),
  )
  .map_err(|err| format!("Failed to create fs watcher: {err}"))?;

  watcher
    .watch(&watch_path, mode)
    .map_err(|err| format!("Failed to watch path: {err}"))?;

  let runtime = Handle::try_current()
    .map_err(|err| format!("Tokio runtime unavailable for fs watcher: {err}"))?;
  let app_handle = app.clone();
  runtime.spawn(async move {
    while let Some(result) = rx.recv().await {
      match result {
        Ok(event) => {
          if !should_emit_for_watch_event(&event) {
            continue;
          }
          while rx.try_recv().is_ok() {}
          if let (Some(state), Some(services)) = (
            app_handle.try_state::<FsState>(),
            app_handle.try_state::<crate::services::AppServices>(),
          ) {
            let _ = emit_fs_changed_async(&app_handle, &state, &services).await;
          }
        }
        Err(err) => log::warn!("fs watcher error: {err}"),
      }
    }
  });

  let mut holder = watcher_state
    .0
    .lock()
    .map_err(|_| "Failed to lock watcher state")?;
  *holder = Some(watcher);
  Ok(())
}

pub fn start_buffer_flush_worker(app: &tauri::AppHandle) {
  let app_handle = app.clone();
  tokio::spawn(async move {
    let mut ticker = tokio::time::interval(Duration::from_millis(BUFFER_FLUSH_INTERVAL_MS));
    loop {
      ticker.tick().await;
      let state = app_handle.try_state::<FsState>();
      let buffer_state = app_handle.try_state::<FsBufferState>();
      let services = app_handle.try_state::<crate::services::AppServices>();
      match (state, buffer_state, services) {
        (Some(state), Some(buffer_state), Some(services)) => {
          match services
            .workspace
            .flush_buffers(&state, &buffer_state)
            .await
          {
            Ok(statuses) => {
              if let Err(err) = emit_buffer_statuses(&app_handle, &statuses) {
                log::warn!("emit buffer statuses failed: {err}");
              }
            }
            Err(err) => log::warn!("flush_all_buffers failed: {err}"),
          }
        }
        _ => break,
      }
    }
  });
}

pub fn flush_all_buffers(state: &FsState, buffer_state: &FsBufferState) -> Result<usize, String> {
  Ok(flush_all_buffers_with_status(state, buffer_state)?.len())
}

fn flush_all_buffers_with_status(
  state: &FsState,
  buffer_state: &FsBufferState,
) -> Result<Vec<FsBufferStatus>, String> {
  crate::services::fs_buffer::flush_all_buffers_with_status(state, buffer_state)
}

fn should_emit_for_watch_event(event: &notify::Event) -> bool {
  let interesting_kind = matches!(
    event.kind,
    EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
  );
  if !interesting_kind {
    return false;
  }

  if event.paths.is_empty() {
    return true;
  }

  if event.paths.iter().all(|path| is_temp_write_path(path)) {
    return false;
  }

  if matches!(event.kind, EventKind::Modify(ModifyKind::Name(_)))
    && is_temp_write_rename(&event.paths)
  {
    return false;
  }

  true
}

fn is_temp_write_path(path: &Path) -> bool {
  path
    .extension()
    .and_then(|ext| ext.to_str())
    .map(|ext| ext.eq_ignore_ascii_case("tmp"))
    .unwrap_or(false)
}

fn is_temp_write_rename(paths: &[PathBuf]) -> bool {
  if paths.len() != 2 {
    return false;
  }

  let first = &paths[0];
  let second = &paths[1];
  let (tmp_path, other_path) = if is_temp_write_path(first) {
    (first, second)
  } else if is_temp_write_path(second) {
    (second, first)
  } else {
    return false;
  };

  let Some(tmp_stem) = tmp_path.file_stem().and_then(|name| name.to_str()) else {
    return false;
  };
  let Some(other_stem) = other_path.file_stem().and_then(|name| name.to_str()) else {
    return false;
  };

  tmp_stem == other_stem
}

async fn emit_fs_changed_async(
  app: &tauri::AppHandle,
  state: &FsState,
  services: &crate::services::AppServices,
) -> Result<(), String> {
  let snapshot = services.workspace.snapshot(state).await?;
  app
    .emit("fs-changed", snapshot)
    .map_err(|err| err.to_string())
}

fn emit_buffer_statuses(app: &tauri::AppHandle, statuses: &[FsBufferStatus]) -> Result<(), String> {
  for status in statuses {
    emit_buffer_status(app, status)?;
  }
  Ok(())
}

fn emit_buffer_status(app: &tauri::AppHandle, status: &FsBufferStatus) -> Result<(), String> {
  app
    .emit("fs-buffer-status", status.clone())
    .map_err(|err| err.to_string())
}
