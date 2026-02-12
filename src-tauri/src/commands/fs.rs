use std::fs;
use std::path::{Component, Path, PathBuf};

use notify::{event::ModifyKind, Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{Emitter, Manager, State};
use tokio::runtime::Handle;
use tokio::sync::mpsc;

use crate::models::{FsEntry, FsRootInfo, FsSnapshot};
use crate::state::{FsState, FsWatcherState};

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
      }
      None => {
        data.root_kind = "internal".to_string();
        data.root_path = data.internal_root.clone();
        ensure_default_file(&data.root_path)?;
      }
    }
    FsRootInfo {
      kind: data.root_kind.clone(),
      path: data.root_path.to_string_lossy().to_string(),
    }
  };

  start_fs_watcher(&app, &state, &watcher_state)?;
  emit_fs_changed(&app, &state)?;
  Ok(root_info)
}

#[tauri::command]
pub fn fs_list_entries(state: State<'_, FsState>) -> Result<Vec<FsEntry>, String> {
  let data = state.0.read().map_err(|_| "Failed to lock fs state")?;
  list_entries(&data.root_path)
}

#[tauri::command]
pub fn fs_read_file(path: String, state: State<'_, FsState>) -> Result<String, String> {
  let data = state.0.read().map_err(|_| "Failed to lock fs state")?;
  let resolved = resolve_path(&data.root_path, &path)?;
  fs::read_to_string(resolved).map_err(|err| format!("Failed to read file: {err}"))
}

#[tauri::command]
pub fn fs_write_file(
  path: String,
  content: String,
  state: State<'_, FsState>,
) -> Result<(), String> {
  let data = state.0.read().map_err(|_| "Failed to lock fs state")?;
  let resolved = resolve_path(&data.root_path, &path)?;
  if let Some(parent) = resolved.parent() {
    fs::create_dir_all(parent).map_err(|err| format!("Failed to create dir: {err}"))?;
  }
  fs::write(resolved, content).map_err(|err| format!("Failed to write file: {err}"))?;
  Ok(())
}

#[tauri::command]
pub fn fs_create_file(
  path: String,
  state: State<'_, FsState>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let data = state.0.read().map_err(|_| "Failed to lock fs state")?;
  let resolved = resolve_path(&data.root_path, &path)?;
  if let Some(parent) = resolved.parent() {
    fs::create_dir_all(parent).map_err(|err| format!("Failed to create dir: {err}"))?;
  }
  if !resolved.exists() {
    fs::write(resolved, "").map_err(|err| format!("Failed to create file: {err}"))?;
  }
  emit_fs_changed(&app, &state)?;
  Ok(())
}

#[tauri::command]
pub fn fs_create_dir(
  path: String,
  state: State<'_, FsState>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let data = state.0.read().map_err(|_| "Failed to lock fs state")?;
  let resolved = resolve_path(&data.root_path, &path)?;
  fs::create_dir_all(resolved).map_err(|err| format!("Failed to create dir: {err}"))?;
  emit_fs_changed(&app, &state)?;
  Ok(())
}

#[tauri::command]
pub fn fs_delete_path(
  path: String,
  state: State<'_, FsState>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let data = state.0.read().map_err(|_| "Failed to lock fs state")?;
  let resolved = resolve_path(&data.root_path, &path)?;
  if resolved.is_dir() {
    fs::remove_dir_all(resolved).map_err(|err| format!("Failed to delete dir: {err}"))?;
  } else {
    fs::remove_file(resolved).map_err(|err| format!("Failed to delete file: {err}"))?;
  }
  emit_fs_changed(&app, &state)?;
  Ok(())
}

#[tauri::command]
pub fn fs_rename_path(
  from: String,
  to: String,
  state: State<'_, FsState>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let data = state.0.read().map_err(|_| "Failed to lock fs state")?;
  let from_path = resolve_path(&data.root_path, &from)?;
  let to_path = resolve_path(&data.root_path, &to)?;
  if let Some(parent) = to_path.parent() {
    fs::create_dir_all(parent).map_err(|err| format!("Failed to create dir: {err}"))?;
  }
  fs::rename(from_path, to_path).map_err(|err| format!("Failed to rename: {err}"))?;
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

  let (tx, mut rx) = mpsc::unbounded_channel();
  let mut watcher: RecommendedWatcher = RecommendedWatcher::new(
    move |result| {
      let _ = tx.send(result);
    },
    Config::default(),
  )
  .map_err(|err| format!("Failed to create fs watcher: {err}"))?;

  watcher
    .watch(&root_path, RecursiveMode::Recursive)
    .map_err(|err| format!("Failed to watch path: {err}"))?;

  let runtime =
    Handle::try_current().map_err(|err| format!("Tokio runtime unavailable for fs watcher: {err}"))?;
  let app_handle = app.clone();
  runtime.spawn(async move {
    while let Some(result) = rx.recv().await {
      match result {
        Ok(event) => {
          let interesting = matches!(
            event.kind,
            EventKind::Any
              | EventKind::Create(_)
              | EventKind::Remove(_)
              | EventKind::Modify(ModifyKind::Name(_))
              | EventKind::Modify(ModifyKind::Metadata(_))
              | EventKind::Modify(ModifyKind::Any)
          );
          if !interesting {
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

fn resolve_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
  if relative.trim().is_empty() {
    return Err("Path must not be empty".to_string());
  }
  let rel = Path::new(relative);
  if rel.is_absolute() {
    return Err("Path must be relative".to_string());
  }
  for component in rel.components() {
    if matches!(component, Component::ParentDir) {
      return Err("Parent paths are not allowed".to_string());
    }
  }
  Ok(root.join(rel))
}

fn list_entries(root: &Path) -> Result<Vec<FsEntry>, String> {
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
  let (root_kind, root_path) = {
    let data = state.0.read().map_err(|_| "Failed to lock fs state")?;
    (data.root_kind.clone(), data.root_path.clone())
  };
  let entries = list_entries(&root_path)?;
  Ok(FsSnapshot {
    root: FsRootInfo {
      kind: root_kind,
      path: root_path.to_string_lossy().to_string(),
    },
    entries,
  })
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

fn emit_fs_changed(app: &tauri::AppHandle, state: &FsState) -> Result<(), String> {
  let snapshot = snapshot_from_state(state)?;
  app.emit("fs-changed", snapshot).map_err(|err| err.to_string())
}
