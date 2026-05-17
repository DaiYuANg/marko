use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};

use notify::{event::ModifyKind, Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{Emitter, Manager, State};
use tokio::runtime::Handle;
use tokio::sync::mpsc;

use crate::models::{
  FsBufferStatus, FsEntry, FsPathMetadata, FsRootInfo, FsSnapshot, FsWorkspaceIndex,
};
use crate::state::{FsBufferState, FsState, FsStateData, FsWatcherState};

const BUFFER_FLUSH_INTERVAL_MS: u64 = 1200;

#[tauri::command]
pub fn fs_get_root_info(state: State<'_, FsState>) -> Result<FsRootInfo, String> {
  let data = state.0.read().map_err(|_| "Failed to lock fs state")?;
  Ok(FsRootInfo {
    kind: data.root_kind.clone(),
    path: data.root_path.to_string_lossy().to_string(),
  })
}

#[tauri::command]
pub fn fs_get_snapshot(state: State<'_, FsState>) -> Result<FsSnapshot, String> {
  snapshot_from_state(&state)
}

#[tauri::command]
pub fn fs_set_root(
  path: Option<String>,
  state: State<'_, FsState>,
  watcher_state: State<'_, FsWatcherState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<FsRootInfo, String> {
  let root_info = {
    let mut data = state.0.write().map_err(|_| "Failed to lock fs state")?;
    match path {
      Some(path) => {
        let root = PathBuf::from(path);
        if !root.exists() || !root.is_dir() {
          return Err("Selected path is not a directory".to_string());
        }
        data.root_kind = "external".to_string();
        data.root_path = root;
        data.single_file = None;
      }
      None => {
        data.root_kind = "internal".to_string();
        data.root_path = data.internal_root.clone();
        data.single_file = None;
        ensure_default_file(&data.root_path)?;
      }
    }
    FsRootInfo {
      kind: data.root_kind.clone(),
      path: data.root_path.to_string_lossy().to_string(),
    }
  };

  services.fs_buffer.clear(&buffer_state)?;
  start_fs_watcher(&app, &state, &watcher_state)?;
  emit_fs_changed(&app, &state)?;
  Ok(root_info)
}

#[tauri::command]
pub fn fs_set_single_file(
  path: String,
  state: State<'_, FsState>,
  watcher_state: State<'_, FsWatcherState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<FsRootInfo, String> {
  let file_path = PathBuf::from(path);
  if !file_path.exists() || !file_path.is_file() {
    return Err("Selected path is not a file".to_string());
  }
  if !is_markdown(&file_path) {
    return Err("Selected file is not a Markdown file".to_string());
  }

  let root_info = {
    let mut data = state.0.write().map_err(|_| "Failed to lock fs state")?;
    data.root_kind = "single".to_string();
    data.root_path = file_path.clone();
    data.single_file = Some(file_path.clone());
    FsRootInfo {
      kind: data.root_kind.clone(),
      path: data.root_path.to_string_lossy().to_string(),
    }
  };

  services.fs_buffer.clear(&buffer_state)?;
  start_fs_watcher(&app, &state, &watcher_state)?;
  emit_fs_changed(&app, &state)?;
  Ok(root_info)
}

#[tauri::command]
pub fn fs_list_entries(state: State<'_, FsState>) -> Result<Vec<FsEntry>, String> {
  let data = state.0.read().map_err(|_| "Failed to lock fs state")?;
  list_entries(&data)
}

#[tauri::command]
pub fn fs_read_file(
  path: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<String, String> {
  if let Some(content) = services.fs_buffer.read(&path, &buffer_state)? {
    return Ok(content);
  }
  read_from_disk(&path, &state)
}

#[tauri::command]
pub fn fs_get_workspace_index(
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<FsWorkspaceIndex, String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  let entries = list_entries(&data)?;
  let files = entries
    .into_iter()
    .filter(|entry| entry.kind == "file")
    .collect::<Vec<_>>();

  let contents = files
    .iter()
    .map(|file| {
      let content = if let Some(content) = services.fs_buffer.read(&file.path, &buffer_state)? {
        content
      } else {
        read_from_disk_data(&file.path, &data)?
      };
      Ok((file.path.clone(), content))
    })
    .collect::<Result<Vec<_>, String>>()?;

  Ok(
    services
      .markdown_index
      .build_workspace_index(&files, &contents),
  )
}

#[tauri::command]
pub fn fs_open_file(
  path: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<String, String> {
  if let Some(content) = services.fs_buffer.read(&path, &buffer_state)? {
    return Ok(content);
  }

  let content = read_from_disk(&path, &state)?;
  services
    .fs_buffer
    .insert_clean(&buffer_state, &path, &content)?;
  Ok(content)
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
  let state_data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  let _ = services.path_resolver.resolve(&state_data, &path)?;
  let status = services.fs_buffer.upsert(&buffer_state, &path, &content)?;
  emit_buffer_status(&app, &status)?;
  Ok(status)
}

#[tauri::command]
pub fn fs_flush_buffers(
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<usize, String> {
  let statuses = services
    .fs_buffer
    .flush_all_with_status(&state, &buffer_state)?;
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
pub fn fs_get_path_metadata(
  path: String,
  state: State<'_, FsState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<FsPathMetadata, String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  let resolved = services.path_resolver.resolve(&data, &path)?;
  let metadata =
    fs::metadata(&resolved).map_err(|err| format!("Failed to read metadata: {err}"))?;

  let modified_ms = metadata
    .modified()
    .ok()
    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
    .map(|duration| duration.as_millis());

  Ok(FsPathMetadata {
    path,
    absolute_path: resolved.to_string_lossy().to_string(),
    kind: if metadata.is_dir() {
      "folder".to_string()
    } else {
      "file".to_string()
    },
    size_bytes: metadata.len(),
    modified_ms,
    readonly: metadata.permissions().readonly(),
  })
}

// Kept for backward compatibility with old frontend calls.
#[tauri::command]
pub fn fs_write_file(
  path: String,
  content: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
) -> Result<(), String> {
  let state_data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  let _ = services.path_resolver.resolve(&state_data, &path)?;
  services
    .fs_buffer
    .upsert(&buffer_state, &path, &content)
    .map(|_| ())
}

#[tauri::command]
pub fn fs_create_file(
  path: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  ensure_workspace_mode(&data)?;
  let resolved = services.path_resolver.resolve(&data, &path)?;
  if let Some(parent) = resolved.parent() {
    fs::create_dir_all(parent).map_err(|err| format!("Failed to create dir: {err}"))?;
  }
  if !resolved.exists() {
    fs::write(resolved, "").map_err(|err| format!("Failed to create file: {err}"))?;
  }

  services.fs_buffer.remove_path(&buffer_state, &path)?;

  emit_fs_changed(&app, &state)?;
  Ok(())
}

#[tauri::command]
pub fn fs_create_dir(
  path: String,
  state: State<'_, FsState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  ensure_workspace_mode(&data)?;
  let resolved = services.path_resolver.resolve(&data, &path)?;
  fs::create_dir_all(resolved).map_err(|err| format!("Failed to create dir: {err}"))?;
  emit_fs_changed(&app, &state)?;
  Ok(())
}

#[tauri::command]
pub fn fs_delete_path(
  path: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  ensure_workspace_mode(&data)?;
  let resolved = services.path_resolver.resolve(&data, &path)?;
  if resolved.is_dir() {
    fs::remove_dir_all(resolved).map_err(|err| format!("Failed to delete dir: {err}"))?;
  } else {
    fs::remove_file(resolved).map_err(|err| format!("Failed to delete file: {err}"))?;
  }
  services.fs_buffer.remove_path(&buffer_state, &path)?;
  emit_fs_changed(&app, &state)?;
  Ok(())
}

#[tauri::command]
pub fn fs_rename_path(
  from: String,
  to: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  services: State<'_, crate::services::AppServices>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  ensure_workspace_mode(&data)?;
  let from_path = services.path_resolver.resolve(&data, &from)?;
  let to_path = services.path_resolver.resolve(&data, &to)?;
  if let Some(parent) = to_path.parent() {
    fs::create_dir_all(parent).map_err(|err| format!("Failed to create dir: {err}"))?;
  }
  fs::rename(from_path, to_path).map_err(|err| format!("Failed to rename: {err}"))?;
  services.fs_buffer.rename_path(&buffer_state, &from, &to)?;
  emit_fs_changed(&app, &state)?;
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
          if let Some(state) = app_handle.try_state::<FsState>() {
            let _ = emit_fs_changed(&app_handle, &state);
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
            .fs_buffer
            .flush_all_with_status(&state, &buffer_state)
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

pub fn ensure_default_file(root: &Path) -> Result<(), String> {
  if !root.exists() {
    fs::create_dir_all(root).map_err(|err| format!("Failed to create dir: {err}"))?;
  }
  for entry in walkdir::WalkDir::new(root)
    .min_depth(1)
    .into_iter()
    .filter_entry(|entry| !is_hidden(entry.path()))
  {
    let entry = entry.map_err(|err| err.to_string())?;
    if entry.file_type().is_file() && is_markdown(entry.path()) {
      return Ok(());
    }
  }
  let default_path = root.join("Untitled.md");
  if !default_path.exists() {
    fs::write(default_path, "").map_err(|err| format!("Failed to create default file: {err}"))?;
  }
  Ok(())
}

pub fn flush_all_buffers(state: &FsState, buffer_state: &FsBufferState) -> Result<usize, String> {
  Ok(flush_all_buffers_with_status(state, buffer_state)?.len())
}

fn flush_all_buffers_with_status(
  state: &FsState,
  buffer_state: &FsBufferState,
) -> Result<Vec<FsBufferStatus>, String> {
  crate::services::fs_buffer::BufferService.flush_all_with_status(state, buffer_state)
}

fn read_from_disk(path: &str, state: &FsState) -> Result<String, String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  read_from_disk_data(path, &data)
}

fn read_from_disk_data(path: &str, data: &FsStateData) -> Result<String, String> {
  let resolved = resolve_path(data, path)?;
  fs::read_to_string(resolved).map_err(|err| format!("Failed to read file: {err}"))
}

fn resolve_path(data: &FsStateData, relative: &str) -> Result<PathBuf, String> {
  crate::services::path_resolver::PathResolver.resolve(data, relative)
}

fn list_entries(data: &FsStateData) -> Result<Vec<FsEntry>, String> {
  if data.root_kind == "single" {
    if let Some(single_file) = &data.single_file {
      let name = single_file
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?
        .to_string();
      return Ok(vec![FsEntry {
        path: name.clone(),
        name,
        kind: "file".to_string(),
      }]);
    }
    return Ok(vec![]);
  }

  let root = &data.root_path;
  let mut entries = Vec::new();
  if !root.exists() {
    return Ok(entries);
  }
  for entry in walkdir::WalkDir::new(root)
    .min_depth(1)
    .into_iter()
    .filter_entry(|entry| !is_hidden(entry.path()))
  {
    let entry = entry.map_err(|err| err.to_string())?;
    let path = entry.path();
    let rel = path
      .strip_prefix(root)
      .map_err(|_| "Failed to compute relative path")?
      .to_string_lossy()
      .replace('\\', "/");
    if entry.file_type().is_dir() {
      entries.push(FsEntry {
        path: rel.clone(),
        name: entry.file_name().to_string_lossy().to_string(),
        kind: "folder".to_string(),
      });
      continue;
    }
    if !is_markdown(path) {
      continue;
    }
    entries.push(FsEntry {
      path: rel.clone(),
      name: entry.file_name().to_string_lossy().to_string(),
      kind: "file".to_string(),
    });
  }
  entries.sort_by(|a, b| a.path.cmp(&b.path));
  Ok(entries)
}

fn snapshot_from_state(state: &FsState) -> Result<FsSnapshot, String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  let entries = list_entries(&data)?;
  Ok(FsSnapshot {
    root: FsRootInfo {
      kind: data.root_kind,
      path: data.root_path.to_string_lossy().to_string(),
    },
    entries,
  })
}

fn ensure_workspace_mode(data: &FsStateData) -> Result<(), String> {
  if data.root_kind == "single" {
    return Err("Operation is not supported in single-file mode".to_string());
  }
  Ok(())
}

fn is_hidden(path: &Path) -> bool {
  path
    .file_name()
    .and_then(|name| name.to_str())
    .map(|name| name.starts_with('.'))
    .unwrap_or(false)
}

fn is_markdown(path: &Path) -> bool {
  path
    .extension()
    .and_then(|ext| ext.to_str())
    .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
    .unwrap_or(false)
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

fn emit_fs_changed(app: &tauri::AppHandle, state: &FsState) -> Result<(), String> {
  let snapshot = snapshot_from_state(state)?;
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
