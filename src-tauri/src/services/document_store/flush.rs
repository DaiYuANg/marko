use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::models::FsBufferStatus;
use crate::services::path_resolver::PathResolver;
use crate::state::{FsState, FsStateData};

use super::cache::status_from_document;
use super::entry::DocumentStoreEntry;

#[derive(Debug, Clone)]
struct PendingDocumentWrite {
  path: String,
  absolute_path: PathBuf,
  content: String,
  revision: u64,
}

pub(super) fn flush_all_documents_with_status_for_resolver(
  path_resolver: &PathResolver,
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
  state: &FsState,
) -> Result<Vec<FsBufferStatus>, String> {
  let state_data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();

  let pending = {
    let documents = documents
      .lock()
      .map_err(|_| "Failed to lock document state")?;
    collect_dirty_writes(path_resolver, &state_data, &documents)?
  };
  if pending.is_empty() {
    return Ok(Vec::new());
  }

  for item in &pending {
    write_to_disk(&item.absolute_path, &item.content)?;
  }

  mark_pending_writes_clean(documents, pending)
}

pub(super) async fn flush_all_documents_with_status_async_for_resolver(
  path_resolver: &PathResolver,
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
  state: &FsState,
) -> Result<Vec<FsBufferStatus>, String> {
  let state_data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();

  let pending = {
    let documents = documents
      .lock()
      .map_err(|_| "Failed to lock document state")?;
    collect_dirty_writes(path_resolver, &state_data, &documents)?
  };
  if pending.is_empty() {
    return Ok(Vec::new());
  }

  for item in &pending {
    write_to_disk_async(&item.absolute_path, &item.content).await?;
  }

  mark_pending_writes_clean(documents, pending)
}

fn collect_dirty_writes(
  path_resolver: &PathResolver,
  state_data: &FsStateData,
  documents: &HashMap<String, DocumentStoreEntry>,
) -> Result<Vec<PendingDocumentWrite>, String> {
  let mut pending = Vec::new();
  for (path, entry) in documents {
    if !entry.dirty {
      continue;
    }
    let absolute_path = path_resolver.resolve(state_data, path)?;
    pending.push(PendingDocumentWrite {
      path: path.clone(),
      absolute_path,
      content: entry.content.clone(),
      revision: entry.revision,
    });
  }
  Ok(pending)
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

async fn write_to_disk_async(path: &Path, content: &str) -> Result<(), String> {
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

fn mark_pending_writes_clean(
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
  pending: Vec<PendingDocumentWrite>,
) -> Result<Vec<FsBufferStatus>, String> {
  let mut documents = documents
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  let mut statuses = Vec::new();
  for item in pending {
    if let Some(entry) = documents.get_mut(&item.path) {
      if entry.revision == item.revision {
        entry.dirty = false;
        entry.saved_revision = item.revision;
        statuses.push(status_from_document(&item.path, entry));
      }
    }
  }
  Ok(statuses)
}
