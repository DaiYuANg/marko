use std::path::Path;
use std::time::Duration;

use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode, DebounceEventResult};
use tauri::{Emitter, Manager};
use tokio::runtime::Handle;

use crate::models::{BackgroundTaskStatus, FsBufferStatus};
use crate::state::{BackgroundTasksState, FsBufferState, FsState, FsWatcherState};

const BUFFER_FLUSH_INTERVAL_MS: u64 = 1200;

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

  let runtime = Handle::try_current()
    .map_err(|err| format!("Tokio runtime unavailable for fs watcher: {err}"))?;
  let app_handle = app.clone();
  let mut debouncer = new_debouncer(Duration::from_millis(250), move |result| {
    handle_fs_watch_events(result, &runtime, &app_handle);
  })
  .map_err(|err| format!("Failed to create fs watcher: {err}"))?;

  debouncer
    .watcher()
    .watch(&watch_path, mode)
    .map_err(|err| format!("Failed to watch path: {err}"))?;

  let mut holder = watcher_state
    .0
    .lock()
    .map_err(|_| "Failed to lock watcher state")?;
  *holder = Some(debouncer);
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
      let task_state = app_handle.try_state::<BackgroundTasksState>();
      let services = app_handle.try_state::<crate::services::AppServices>();
      match (state, buffer_state, task_state, services) {
        (Some(state), Some(buffer_state), Some(task_state), Some(services)) => {
          match has_dirty_buffers(&buffer_state) {
            Ok(true) => {}
            Ok(false) => continue,
            Err(err) => {
              log::warn!("check dirty buffers failed: {err}");
              continue;
            }
          }
          if let Err(err) =
            set_background_task(&task_state, "buffer-flush", "Save queue", "running", None)
          {
            log::warn!("set background task failed: {err}");
          }
          match services
            .workspace
            .flush_buffers(&state, &buffer_state)
            .await
          {
            Ok(statuses) => {
              if let Err(err) =
                set_background_task(&task_state, "buffer-flush", "Save queue", "idle", None)
              {
                log::warn!("set background task failed: {err}");
              }
              if let Err(err) = emit_buffer_statuses(&app_handle, &statuses) {
                log::warn!("emit buffer statuses failed: {err}");
              }
            }
            Err(err) => {
              let _ = set_background_task(
                &task_state,
                "buffer-flush",
                "Save queue",
                "error",
                Some(err.clone()),
              );
              log::warn!("flush_all_buffers failed: {err}");
            }
          }
        }
        _ => break,
      }
    }
  });
}

pub async fn emit_fs_changed_async(
  app: &tauri::AppHandle,
  state: &FsState,
  services: &crate::services::AppServices,
) -> Result<(), String> {
  let snapshot = services.workspace.snapshot(state).await?;
  app
    .emit("fs-changed", snapshot)
    .map_err(|err| err.to_string())
}

pub fn emit_buffer_statuses(
  app: &tauri::AppHandle,
  statuses: &[FsBufferStatus],
) -> Result<(), String> {
  for status in statuses {
    emit_buffer_status(app, status)?;
  }
  Ok(())
}

pub fn emit_buffer_status(app: &tauri::AppHandle, status: &FsBufferStatus) -> Result<(), String> {
  app
    .emit("fs-buffer-status", status.clone())
    .map_err(|err| err.to_string())
}

pub fn set_background_task(
  task_state: &BackgroundTasksState,
  id: &str,
  label: &str,
  status: &str,
  message: Option<String>,
) -> Result<(), String> {
  let mut tasks = task_state
    .0
    .lock()
    .map_err(|_| "Failed to lock task state")?;
  tasks.insert(
    id.to_string(),
    BackgroundTaskStatus {
      id: id.to_string(),
      label: label.to_string(),
      status: status.to_string(),
      message,
    },
  );
  Ok(())
}

fn handle_fs_watch_events(
  result: DebounceEventResult,
  runtime: &Handle,
  app_handle: &tauri::AppHandle,
) {
  match result {
    Ok(events) => {
      if events.is_empty() || events.iter().all(|event| is_temp_write_path(&event.path)) {
        return;
      }
      let app_handle = app_handle.clone();
      runtime.spawn(async move {
        if let (Some(state), Some(services)) = (
          app_handle.try_state::<FsState>(),
          app_handle.try_state::<crate::services::AppServices>(),
        ) {
          let _ = emit_fs_changed_async(&app_handle, &state, &services).await;
        }
      });
    }
    Err(err) => log::warn!("fs watcher error: {err}"),
  }
}

fn is_temp_write_path(path: &Path) -> bool {
  path
    .extension()
    .and_then(|ext| ext.to_str())
    .map(|ext| ext.eq_ignore_ascii_case("tmp"))
    .unwrap_or(false)
}

fn has_dirty_buffers(buffer_state: &FsBufferState) -> Result<bool, String> {
  let buffers = buffer_state
    .0
    .lock()
    .map_err(|_| "Failed to lock buffer state")?;
  Ok(buffers.values().any(|entry| entry.dirty))
}
