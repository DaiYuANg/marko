use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};

use notify::{event::ModifyKind, Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{Emitter, Manager, State};
use tokio::runtime::Handle;
use tokio::sync::mpsc;

use crate::models::{
  FsBufferStatus, FsEntry, FsIndexedMarkdownFile, FsMarkdownHeading, FsMarkdownLink,
  FsPathMetadata, FsRootInfo, FsSnapshot, FsWorkspaceIndex,
};
use crate::state::{FsBufferEntry, FsBufferState, FsState, FsStateData, FsWatcherState};

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

  clear_buffers(&buffer_state)?;
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

  clear_buffers(&buffer_state)?;
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
) -> Result<String, String> {
  if let Some(content) = read_from_buffer(&path, &buffer_state)? {
    return Ok(content);
  }
  read_from_disk(&path, &state)
}

#[tauri::command]
pub fn fs_get_workspace_index(
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
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
      let content = if let Some(content) = read_from_buffer(&file.path, &buffer_state)? {
        content
      } else {
        read_from_disk_data(&file.path, &data)?
      };
      Ok((file.path.clone(), content))
    })
    .collect::<Result<Vec<_>, String>>()?;

  Ok(build_workspace_index(&files, &contents))
}

#[tauri::command]
pub fn fs_open_file(
  path: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
) -> Result<String, String> {
  if let Some(content) = read_from_buffer(&path, &buffer_state)? {
    return Ok(content);
  }

  let content = read_from_disk(&path, &state)?;
  let mut buffers = buffer_state
    .0
    .lock()
    .map_err(|_| "Failed to lock buffer state")?;
  buffers.insert(
    path,
    FsBufferEntry {
      content: content.clone(),
      dirty: false,
      revision: 0,
    },
  );
  Ok(content)
}

#[tauri::command]
pub fn fs_update_buffer(
  path: String,
  content: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  app: tauri::AppHandle,
) -> Result<FsBufferStatus, String> {
  let state_data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  let _ = resolve_path(&state_data, &path)?;
  let status = upsert_buffer(&buffer_state, &path, &content)?;
  emit_buffer_status(&app, &status)?;
  Ok(status)
}

#[tauri::command]
pub fn fs_flush_buffers(
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  app: tauri::AppHandle,
) -> Result<usize, String> {
  let statuses = flush_all_buffers_with_status(&state, &buffer_state)?;
  emit_buffer_statuses(&app, &statuses)?;
  Ok(statuses.len())
}

#[tauri::command]
pub fn fs_get_buffer_status(
  path: String,
  buffer_state: State<'_, FsBufferState>,
) -> Result<Option<FsBufferStatus>, String> {
  let buffers = buffer_state
    .0
    .lock()
    .map_err(|_| "Failed to lock buffer state")?;
  Ok(
    buffers
      .get(&path)
      .map(|entry| status_from_buffer(&path, entry)),
  )
}

#[tauri::command]
pub fn fs_get_path_metadata(
  path: String,
  state: State<'_, FsState>,
) -> Result<FsPathMetadata, String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  let resolved = resolve_path(&data, &path)?;
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
) -> Result<(), String> {
  let state_data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  let _ = resolve_path(&state_data, &path)?;
  upsert_buffer(&buffer_state, &path, &content).map(|_| ())
}

#[tauri::command]
pub fn fs_create_file(
  path: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  ensure_workspace_mode(&data)?;
  let resolved = resolve_path(&data, &path)?;
  if let Some(parent) = resolved.parent() {
    fs::create_dir_all(parent).map_err(|err| format!("Failed to create dir: {err}"))?;
  }
  if !resolved.exists() {
    fs::write(resolved, "").map_err(|err| format!("Failed to create file: {err}"))?;
  }

  let mut buffers = buffer_state
    .0
    .lock()
    .map_err(|_| "Failed to lock buffer state")?;
  buffers.remove(&path);

  emit_fs_changed(&app, &state)?;
  Ok(())
}

#[tauri::command]
pub fn fs_create_dir(
  path: String,
  state: State<'_, FsState>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  ensure_workspace_mode(&data)?;
  let resolved = resolve_path(&data, &path)?;
  fs::create_dir_all(resolved).map_err(|err| format!("Failed to create dir: {err}"))?;
  emit_fs_changed(&app, &state)?;
  Ok(())
}

#[tauri::command]
pub fn fs_delete_path(
  path: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  ensure_workspace_mode(&data)?;
  let resolved = resolve_path(&data, &path)?;
  if resolved.is_dir() {
    fs::remove_dir_all(resolved).map_err(|err| format!("Failed to delete dir: {err}"))?;
  } else {
    fs::remove_file(resolved).map_err(|err| format!("Failed to delete file: {err}"))?;
  }
  remove_buffer_path(&buffer_state, &path)?;
  emit_fs_changed(&app, &state)?;
  Ok(())
}

#[tauri::command]
pub fn fs_rename_path(
  from: String,
  to: String,
  state: State<'_, FsState>,
  buffer_state: State<'_, FsBufferState>,
  app: tauri::AppHandle,
) -> Result<(), String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();
  ensure_workspace_mode(&data)?;
  let from_path = resolve_path(&data, &from)?;
  let to_path = resolve_path(&data, &to)?;
  if let Some(parent) = to_path.parent() {
    fs::create_dir_all(parent).map_err(|err| format!("Failed to create dir: {err}"))?;
  }
  fs::rename(from_path, to_path).map_err(|err| format!("Failed to rename: {err}"))?;
  rename_buffer_path(&buffer_state, &from, &to)?;
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
      match (state, buffer_state) {
        (Some(state), Some(buffer_state)) => {
          match flush_all_buffers_with_status(&state, &buffer_state) {
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
  let state_data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();

  let pending = {
    let buffers = buffer_state
      .0
      .lock()
      .map_err(|_| "Failed to lock buffer state")?;
    collect_dirty_writes(&state_data, &buffers)?
  };
  if pending.is_empty() {
    return Ok(Vec::new());
  }

  for item in &pending {
    write_to_disk(&item.absolute_path, &item.content)?;
  }

  let mut buffers = buffer_state
    .0
    .lock()
    .map_err(|_| "Failed to lock buffer state")?;
  let mut statuses = Vec::new();
  for item in pending {
    if let Some(entry) = buffers.get_mut(&item.path) {
      if entry.revision == item.revision {
        entry.dirty = false;
        statuses.push(status_from_buffer(&item.path, entry));
      }
    }
  }

  Ok(statuses)
}

// helper used by the old write queue worker.
pub async fn write_worker(
  app: &tauri::AppHandle,
  mut rx: tokio::sync::mpsc::UnboundedReceiver<crate::models::FsFileUpdate>,
) -> Result<(), String> {
  use tokio::time::{sleep, Duration, Instant};

  let mut pending: HashMap<String, String> = HashMap::new();

  async fn flush_map(app: &tauri::AppHandle, map: &mut HashMap<String, String>) {
    let state = match app.try_state::<FsState>() {
      Some(s) => s,
      None => return,
    };
    let data = match state.0.read() {
      Ok(d) => d.clone(),
      Err(_) => return,
    };
    for (path, content) in map.drain() {
      if let Err(err) = write_single(&data, &path, &content) {
        log::warn!("batch write failed {}: {}", path, err);
      }
    }
  }

  const DEBOUNCE_MS: u64 = 300;
  let mut deadline = Instant::now() + Duration::from_millis(DEBOUNCE_MS);

  loop {
    tokio::select! {
      maybe = rx.recv() => {
        match maybe {
          Some(req) => {
            pending.insert(req.path, req.content);
            deadline = Instant::now() + Duration::from_millis(DEBOUNCE_MS);
          }
          None => {
            flush_map(app, &mut pending).await;
            break;
          }
        }
      }
      _ = sleep(deadline.saturating_duration_since(Instant::now())) => {
        if !pending.is_empty() {
          flush_map(app, &mut pending).await;
        }
        deadline = Instant::now() + Duration::from_secs(3600);
      }
    }
  }

  Ok(())
}

#[derive(Debug, Clone)]
struct PendingWrite {
  path: String,
  absolute_path: PathBuf,
  content: String,
  revision: u64,
}

fn clear_buffers(buffer_state: &FsBufferState) -> Result<(), String> {
  let mut buffers = buffer_state
    .0
    .lock()
    .map_err(|_| "Failed to lock buffer state")?;
  buffers.clear();
  Ok(())
}

fn collect_dirty_writes(
  state_data: &FsStateData,
  buffers: &HashMap<String, FsBufferEntry>,
) -> Result<Vec<PendingWrite>, String> {
  let mut pending = Vec::new();
  for (path, entry) in buffers {
    if !entry.dirty {
      continue;
    }
    let absolute_path = resolve_path(state_data, path)?;
    pending.push(PendingWrite {
      path: path.clone(),
      absolute_path,
      content: entry.content.clone(),
      revision: entry.revision,
    });
  }
  Ok(pending)
}

fn read_from_buffer(path: &str, buffer_state: &FsBufferState) -> Result<Option<String>, String> {
  let buffers = buffer_state
    .0
    .lock()
    .map_err(|_| "Failed to lock buffer state")?;
  Ok(buffers.get(path).map(|entry| entry.content.clone()))
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

fn upsert_buffer(
  buffer_state: &FsBufferState,
  path: &str,
  content: &str,
) -> Result<FsBufferStatus, String> {
  let mut buffers = buffer_state
    .0
    .lock()
    .map_err(|_| "Failed to lock buffer state")?;

  let entry = buffers.entry(path.to_string()).or_insert(FsBufferEntry {
    content: String::new(),
    dirty: false,
    revision: 0,
  });
  if entry.content == content {
    return Ok(status_from_buffer(path, entry));
  }
  entry.content = content.to_string();
  entry.dirty = true;
  entry.revision = entry.revision.saturating_add(1);
  Ok(status_from_buffer(path, entry))
}

fn status_from_buffer(path: &str, entry: &FsBufferEntry) -> FsBufferStatus {
  FsBufferStatus {
    path: path.to_string(),
    revision: entry.revision,
    dirty: entry.dirty,
  }
}

fn remove_buffer_path(buffer_state: &FsBufferState, path: &str) -> Result<(), String> {
  let mut buffers = buffer_state
    .0
    .lock()
    .map_err(|_| "Failed to lock buffer state")?;
  buffers.retain(|key, _| !is_same_or_child(key, path));
  Ok(())
}

fn rename_buffer_path(buffer_state: &FsBufferState, from: &str, to: &str) -> Result<(), String> {
  let mut buffers = buffer_state
    .0
    .lock()
    .map_err(|_| "Failed to lock buffer state")?;

  let keys: Vec<String> = buffers.keys().cloned().collect();
  for key in keys {
    if !is_same_or_child(&key, from) {
      continue;
    }
    if let Some(entry) = buffers.remove(&key) {
      let suffix = key.strip_prefix(from).unwrap_or_default();
      let next_key = format!("{to}{suffix}");
      buffers.insert(next_key, entry);
    }
  }
  Ok(())
}

fn resolve_path(data: &FsStateData, relative: &str) -> Result<PathBuf, String> {
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

  if data.root_kind == "single" {
    let single_file = data
      .single_file
      .as_ref()
      .ok_or_else(|| "Single-file path is not set".to_string())?;
    let file_name = single_file
      .file_name()
      .and_then(|name| name.to_str())
      .ok_or_else(|| "Invalid file name".to_string())?;
    let normalized_rel = relative.replace('\\', "/");
    if normalized_rel != file_name {
      return Err("Single-file mode only allows operations on the opened file".to_string());
    }
    return Ok(single_file.clone());
  }

  Ok(data.root_path.join(rel))
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

fn build_workspace_index(files: &[FsEntry], contents: &[(String, String)]) -> FsWorkspaceIndex {
  let existing_paths = files
    .iter()
    .filter(|file| file.kind == "file")
    .map(|file| file.path.clone())
    .collect::<HashSet<_>>();
  let name_index = files
    .iter()
    .filter(|file| file.kind == "file")
    .map(|file| {
      (
        create_file_label(&file.path).to_lowercase(),
        file.path.clone(),
      )
    })
    .collect::<HashMap<_, _>>();

  let files = contents
    .iter()
    .map(|(path, content)| {
      let headings = extract_headings(path, content);
      let links = extract_links(content)
        .into_iter()
        .map(|link| normalize_link(path, link, &name_index, &existing_paths))
        .collect();
      FsIndexedMarkdownFile {
        path: path.clone(),
        headings,
        links,
      }
    })
    .collect();

  FsWorkspaceIndex { files }
}

#[derive(Debug, Clone)]
struct RawMarkdownLink {
  text: String,
  target: String,
  link_type: String,
  context: String,
  line: usize,
  column: usize,
}

fn extract_headings(path: &str, content: &str) -> Vec<FsMarkdownHeading> {
  let mut headings = Vec::new();
  let mut used_slugs = HashMap::<String, usize>::new();

  for (line_index, line) in content.lines().enumerate() {
    let level = line.chars().take_while(|char| *char == '#').count();
    if !(1..=6).contains(&level) {
      continue;
    }
    if !line[level..]
      .chars()
      .next()
      .is_some_and(char::is_whitespace)
    {
      continue;
    }

    let text = line[level..].trim().to_string();
    if text.is_empty() {
      continue;
    }

    let base_slug = {
      let slug = slugify(&text);
      if slug.is_empty() {
        format!("heading-{}", headings.len() + 1)
      } else {
        slug
      }
    };
    let used_count = used_slugs.get(&base_slug).copied().unwrap_or(0);
    used_slugs.insert(base_slug.clone(), used_count + 1);
    headings.push(FsMarkdownHeading {
      path: path.to_string(),
      level: level as u8,
      text,
      slug: if used_count == 0 {
        base_slug
      } else {
        format!("{base_slug}-{used_count}")
      },
      line: line_index + 1,
    });
  }

  headings
}

fn extract_links(content: &str) -> Vec<RawMarkdownLink> {
  let mut links = Vec::new();
  links.extend(extract_markdown_links(content));
  links.extend(extract_wiki_links(content));
  links
    .into_iter()
    .filter(|link| !link.target.trim().is_empty())
    .collect()
}

fn extract_markdown_links(content: &str) -> Vec<RawMarkdownLink> {
  let mut links = Vec::new();
  let mut search_start = 0usize;

  while let Some(open_rel) = content[search_start..].find('[') {
    let open = search_start + open_rel;
    if content[open..].starts_with("[[") {
      search_start = open + 2;
      continue;
    }

    let Some(close_rel) = content[open + 1..].find(']') else {
      break;
    };
    let close = open + 1 + close_rel;
    if !content
      .get(close + 1..)
      .unwrap_or_default()
      .starts_with('(')
    {
      search_start = open + 1;
      continue;
    }

    let target_start = close + 2;
    let Some(target_end_rel) = content[target_start..].find(')') else {
      break;
    };
    let target_end = target_start + target_end_rel;
    let text = content[open + 1..close].trim();
    let target = content[target_start..target_end].trim();
    if !text.is_empty() && !target.is_empty() {
      let (line, column) = source_location(content, open);
      links.push(RawMarkdownLink {
        text: text.to_string(),
        target: target.to_string(),
        link_type: "markdown".to_string(),
        context: line_context(content, open),
        line,
        column,
      });
    }
    search_start = target_end + 1;
  }

  links
}

fn extract_wiki_links(content: &str) -> Vec<RawMarkdownLink> {
  let mut links = Vec::new();
  let mut search_start = 0usize;

  while let Some(open_rel) = content[search_start..].find("[[") {
    let open = search_start + open_rel;
    let target_start = open + 2;
    let Some(close_rel) = content[target_start..].find("]]") else {
      break;
    };
    let close = target_start + close_rel;
    let target = content[target_start..close].trim();
    if !target.is_empty() {
      let (line, column) = source_location(content, open);
      links.push(RawMarkdownLink {
        text: target.to_string(),
        target: target.to_string(),
        link_type: "wiki".to_string(),
        context: line_context(content, open),
        line,
        column,
      });
    }
    search_start = close + 2;
  }

  links
}

fn normalize_link(
  source_path: &str,
  link: RawMarkdownLink,
  name_index: &HashMap<String, String>,
  existing_paths: &HashSet<String>,
) -> FsMarkdownLink {
  if is_external_target(&link.target) {
    return FsMarkdownLink {
      source_path: source_path.to_string(),
      text: link.text,
      target: link.target,
      link_type: link.link_type,
      target_path: None,
      target_anchor: None,
      target_heading_slug: None,
      is_external: true,
      context: link.context,
      line: link.line,
      column: link.column,
    };
  }

  let (target_path_part, target_anchor) = split_link_target(&link.target);
  let target_path = if link.link_type == "wiki" {
    name_index
      .get(&target_path_part.to_lowercase())
      .cloned()
      .unwrap_or_else(|| format!("{target_path_part}.md"))
  } else if target_path_part.trim().is_empty() {
    source_path.to_string()
  } else {
    let resolved = resolve_relative_link_path(source_path, &target_path_part);
    resolve_markdown_target_path(&resolved, existing_paths)
  };
  let target_heading_slug = target_anchor
    .as_deref()
    .map(normalize_heading_anchor)
    .filter(|slug| !slug.is_empty());

  FsMarkdownLink {
    source_path: source_path.to_string(),
    text: link.text,
    target: link.target,
    link_type: link.link_type,
    target_path: Some(target_path),
    target_anchor,
    target_heading_slug,
    is_external: false,
    context: link.context,
    line: link.line,
    column: link.column,
  }
}

fn split_link_target(target: &str) -> (String, Option<String>) {
  match target.find('#') {
    Some(index) => (
      target[..index].to_string(),
      Some(target[index + 1..].to_string()),
    ),
    None => (target.to_string(), None),
  }
}

fn resolve_relative_link_path(base: &str, target: &str) -> String {
  let path_part = target.split('#').next().unwrap_or_default();
  if let Some(stripped) = path_part.strip_prefix('/') {
    return normalize_workspace_path(stripped);
  }
  let base_dir = base
    .rsplit_once('/')
    .map(|(dir, _)| dir)
    .unwrap_or_default();
  let joined = if base_dir.is_empty() {
    path_part.to_string()
  } else {
    format!("{base_dir}/{path_part}")
  };
  normalize_workspace_path(&joined)
}

fn resolve_markdown_target_path(target: &str, existing_paths: &HashSet<String>) -> String {
  let normalized = normalize_workspace_path(target);
  if has_markdown_extension(&normalized) {
    return normalized;
  }

  let md = format!("{normalized}.md");
  if existing_paths.contains(&md) {
    return md;
  }
  let markdown = format!("{normalized}.markdown");
  if existing_paths.contains(&markdown) {
    return markdown;
  }
  md
}

fn normalize_workspace_path(value: &str) -> String {
  let normalized = value.replace('\\', "/");
  let mut stack = Vec::<&str>::new();
  for part in normalized.split('/') {
    if part.is_empty() || part == "." {
      continue;
    }
    if part == ".." {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  stack.join("/")
}

fn normalize_heading_anchor(anchor: &str) -> String {
  slugify(&percent_decode(anchor.trim()))
}

fn percent_decode(value: &str) -> String {
  let bytes = value.as_bytes();
  let mut output = Vec::with_capacity(bytes.len());
  let mut index = 0usize;
  while index < bytes.len() {
    if bytes[index] == b'%' && index + 2 < bytes.len() {
      if let Ok(hex) = u8::from_str_radix(&value[index + 1..index + 3], 16) {
        output.push(hex);
        index += 3;
        continue;
      }
    }
    output.push(bytes[index]);
    index += 1;
  }
  String::from_utf8_lossy(&output).to_string()
}

fn slugify(label: &str) -> String {
  let mut slug = String::new();
  let mut previous_dash = false;
  for char in label.trim().chars().flat_map(|char| char.to_lowercase()) {
    if char.is_whitespace() {
      if !previous_dash && !slug.is_empty() {
        slug.push('-');
        previous_dash = true;
      }
      continue;
    }
    if char.is_alphanumeric() || char == '-' {
      slug.push(char);
      previous_dash = char == '-';
    }
  }
  slug.trim_matches('-').to_string()
}

fn create_file_label(relative_path: &str) -> String {
  let base = relative_path.rsplit('/').next().unwrap_or(relative_path);
  base
    .strip_suffix(".markdown")
    .or_else(|| base.strip_suffix(".md"))
    .unwrap_or(base)
    .to_string()
}

fn is_external_target(target: &str) -> bool {
  let lower = target.to_lowercase();
  lower.starts_with("http://")
    || lower.starts_with("https://")
    || lower.starts_with("mailto:")
    || lower.starts_with("tel:")
}

fn has_markdown_extension(path: &str) -> bool {
  let lower = path.to_lowercase();
  lower.ends_with(".md") || lower.ends_with(".markdown")
}

fn source_location(content: &str, byte_index: usize) -> (usize, usize) {
  let before = &content[..byte_index.min(content.len())];
  let line = before.chars().filter(|char| *char == '\n').count() + 1;
  let line_start = before.rfind('\n').map(|index| index + 1).unwrap_or(0);
  let column = content[line_start..byte_index.min(content.len())]
    .chars()
    .count()
    + 1;
  (line, column)
}

fn line_context(content: &str, byte_index: usize) -> String {
  let safe_index = byte_index.min(content.len());
  let line_start = content[..safe_index]
    .rfind('\n')
    .map(|index| index + 1)
    .unwrap_or(0);
  let line_end = content[safe_index..]
    .find('\n')
    .map(|index| safe_index + index)
    .unwrap_or(content.len());
  content[line_start..line_end]
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn indexes_headings_and_normalized_links() {
    let files = vec![
      FsEntry {
        path: "notes/current.md".to_string(),
        name: "current.md".to_string(),
        kind: "file".to_string(),
      },
      FsEntry {
        path: "notes/target.md".to_string(),
        name: "target.md".to_string(),
        kind: "file".to_string(),
      },
      FsEntry {
        path: "daily/today.md".to_string(),
        name: "today.md".to_string(),
        kind: "file".to_string(),
      },
    ];
    let contents = vec![
      (
        "notes/current.md".to_string(),
        "# Current\nSee [Target](target.md#Details) and [[today]].\n".to_string(),
      ),
      (
        "notes/target.md".to_string(),
        "# Target\n## Details\n## API & UI\n".to_string(),
      ),
      ("daily/today.md".to_string(), "# Today\n".to_string()),
    ];

    let index = build_workspace_index(&files, &contents);
    let current = index
      .files
      .iter()
      .find(|file| file.path == "notes/current.md")
      .expect("current file should be indexed");
    let target = index
      .files
      .iter()
      .find(|file| file.path == "notes/target.md")
      .expect("target file should be indexed");

    assert_eq!(target.headings[2].slug, "api-ui");
    assert_eq!(
      current.links[0].target_path.as_deref(),
      Some("notes/target.md")
    );
    assert_eq!(
      current.links[0].target_heading_slug.as_deref(),
      Some("details")
    );
    assert_eq!(
      current.links[1].target_path.as_deref(),
      Some("daily/today.md")
    );
    assert_eq!(current.links[1].link_type, "wiki");
    assert_eq!(current.links[1].line, 2);
  }
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

fn write_single(state_data: &FsStateData, rel: &str, content: &str) -> Result<(), String> {
  let resolved = resolve_path(state_data, rel)?;
  write_to_disk(&resolved, content)
}

fn write_to_disk(path: &Path, content: &str) -> Result<(), String> {
  if let Ok(existing) = fs::read_to_string(path) {
    if existing == content {
      return Ok(());
    }
  }
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
  }
  let tmp = path.with_extension("tmp");
  fs::write(&tmp, content).map_err(|e| format!("Failed to write temp file: {e}"))?;
  fs::rename(&tmp, path).map_err(|e| format!("Failed to rename temp file: {e}"))?;
  Ok(())
}

fn is_same_or_child(path: &str, base: &str) -> bool {
  path == base || path.starts_with(&format!("{base}/"))
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
