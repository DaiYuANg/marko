use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use fluxdi::Shared;

use crate::models::FsBufferStatus;
use crate::services::path_resolver::PathResolver;
use crate::state::{FsBufferEntry, FsBufferState, FsState, FsStateData};

#[derive(Debug, Clone)]
pub struct BufferService {
  path_resolver: Shared<PathResolver>,
}

impl BufferService {
  pub fn new(path_resolver: Shared<PathResolver>) -> Self {
    Self { path_resolver }
  }
}

impl Default for BufferService {
  fn default() -> Self {
    Self::new(Shared::new(PathResolver))
  }
}

#[derive(Debug, Clone)]
pub struct PendingWrite {
  pub path: String,
  pub absolute_path: PathBuf,
  pub content: String,
  pub revision: u64,
}

impl BufferService {
  pub fn clear(&self, buffer_state: &FsBufferState) -> Result<(), String> {
    clear_buffers(buffer_state)
  }

  pub fn read(&self, path: &str, buffer_state: &FsBufferState) -> Result<Option<String>, String> {
    read_from_buffer(path, buffer_state)
  }

  pub fn upsert(
    &self,
    buffer_state: &FsBufferState,
    path: &str,
    content: &str,
  ) -> Result<FsBufferStatus, String> {
    upsert_buffer(buffer_state, path, content)
  }

  pub fn insert_clean(
    &self,
    buffer_state: &FsBufferState,
    path: &str,
    content: &str,
  ) -> Result<(), String> {
    let mut buffers = buffer_state
      .0
      .lock()
      .map_err(|_| "Failed to lock buffer state")?;
    buffers.insert(
      path.to_string(),
      FsBufferEntry {
        content: content.to_string(),
        dirty: false,
        revision: 0,
      },
    );
    Ok(())
  }

  pub fn status(
    &self,
    buffer_state: &FsBufferState,
    path: &str,
  ) -> Result<Option<FsBufferStatus>, String> {
    let buffers = buffer_state
      .0
      .lock()
      .map_err(|_| "Failed to lock buffer state")?;
    Ok(
      buffers
        .get(path)
        .map(|entry| status_from_buffer(path, entry)),
    )
  }

  pub fn remove_path(&self, buffer_state: &FsBufferState, path: &str) -> Result<(), String> {
    remove_buffer_path(buffer_state, path)
  }

  pub fn rename_path(
    &self,
    buffer_state: &FsBufferState,
    from: &str,
    to: &str,
  ) -> Result<(), String> {
    rename_buffer_path(buffer_state, from, to)
  }

  pub fn flush_all_with_status(
    &self,
    state: &FsState,
    buffer_state: &FsBufferState,
  ) -> Result<Vec<FsBufferStatus>, String> {
    flush_all_buffers_with_status_for_resolver(&self.path_resolver, state, buffer_state)
  }

  pub async fn flush_all_with_status_async(
    &self,
    state: &FsState,
    buffer_state: &FsBufferState,
  ) -> Result<Vec<FsBufferStatus>, String> {
    flush_all_buffers_with_status_async_for_resolver(&self.path_resolver, state, buffer_state).await
  }
}

pub fn flush_all_buffers_with_status(
  state: &FsState,
  buffer_state: &FsBufferState,
) -> Result<Vec<FsBufferStatus>, String> {
  BufferService::default().flush_all_with_status(state, buffer_state)
}

fn flush_all_buffers_with_status_for_resolver(
  path_resolver: &PathResolver,
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
    collect_dirty_writes(path_resolver, &state_data, &buffers)?
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

async fn flush_all_buffers_with_status_async_for_resolver(
  path_resolver: &PathResolver,
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
    collect_dirty_writes(path_resolver, &state_data, &buffers)?
  };
  if pending.is_empty() {
    return Ok(Vec::new());
  }

  for item in &pending {
    write_to_disk_async(&item.absolute_path, &item.content).await?;
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

pub fn clear_buffers(buffer_state: &FsBufferState) -> Result<(), String> {
  let mut buffers = buffer_state
    .0
    .lock()
    .map_err(|_| "Failed to lock buffer state")?;
  buffers.clear();
  Ok(())
}

pub fn collect_dirty_writes(
  path_resolver: &PathResolver,
  state_data: &FsStateData,
  buffers: &HashMap<String, FsBufferEntry>,
) -> Result<Vec<PendingWrite>, String> {
  let mut pending = Vec::new();
  for (path, entry) in buffers {
    if !entry.dirty {
      continue;
    }
    let absolute_path = path_resolver.resolve(state_data, path)?;
    pending.push(PendingWrite {
      path: path.clone(),
      absolute_path,
      content: entry.content.clone(),
      revision: entry.revision,
    });
  }
  Ok(pending)
}

pub fn read_from_buffer(
  path: &str,
  buffer_state: &FsBufferState,
) -> Result<Option<String>, String> {
  let buffers = buffer_state
    .0
    .lock()
    .map_err(|_| "Failed to lock buffer state")?;
  Ok(buffers.get(path).map(|entry| entry.content.clone()))
}

pub fn upsert_buffer(
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

pub fn status_from_buffer(path: &str, entry: &FsBufferEntry) -> FsBufferStatus {
  FsBufferStatus {
    path: path.to_string(),
    revision: entry.revision,
    dirty: entry.dirty,
  }
}

pub fn remove_buffer_path(buffer_state: &FsBufferState, path: &str) -> Result<(), String> {
  let mut buffers = buffer_state
    .0
    .lock()
    .map_err(|_| "Failed to lock buffer state")?;
  buffers.retain(|key, _| !is_same_or_child(key, path));
  Ok(())
}

pub fn rename_buffer_path(
  buffer_state: &FsBufferState,
  from: &str,
  to: &str,
) -> Result<(), String> {
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

pub fn write_to_disk(path: &Path, content: &str) -> Result<(), String> {
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

pub async fn write_to_disk_async(path: &Path, content: &str) -> Result<(), String> {
  if let Ok(existing) = tokio::fs::read_to_string(path).await {
    if existing == content {
      return Ok(());
    }
  }
  if let Some(parent) = path.parent() {
    tokio::fs::create_dir_all(parent)
      .await
      .map_err(|e| format!("Failed to create dir: {e}"))?;
  }
  let tmp = path.with_extension("tmp");
  tokio::fs::write(&tmp, content)
    .await
    .map_err(|e| format!("Failed to write temp file: {e}"))?;
  tokio::fs::rename(&tmp, path)
    .await
    .map_err(|e| format!("Failed to rename temp file: {e}"))?;
  Ok(())
}

fn is_same_or_child(path: &str, base: &str) -> bool {
  path == base || path.starts_with(&format!("{base}/"))
}
