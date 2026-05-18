use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use fluxdi::Shared;

use crate::models::{FsBufferStatus, FsEntry};
use crate::services::path_resolver::PathResolver;
use crate::state::{FsBufferEntry, FsBufferState, FsState, FsStateData};

#[derive(Debug, Clone)]
pub struct DocumentStoreService {
  path_resolver: Shared<PathResolver>,
}

impl DocumentStoreService {
  pub fn new(path_resolver: Shared<PathResolver>) -> Self {
    Self { path_resolver }
  }
}

impl Default for DocumentStoreService {
  fn default() -> Self {
    Self::new(Shared::new(PathResolver))
  }
}

#[derive(Debug, Clone)]
pub struct PendingDocumentWrite {
  pub path: String,
  pub absolute_path: PathBuf,
  pub content: String,
  pub revision: u64,
}

#[derive(Debug, Clone)]
pub struct DocumentSnapshot {
  pub path: String,
  pub content: String,
  pub revision: u64,
  pub dirty: bool,
}

impl DocumentStoreService {
  pub fn clear(&self, document_state: &FsBufferState) -> Result<(), String> {
    clear_documents(document_state)
  }

  pub fn cached_content(
    &self,
    path: &str,
    document_state: &FsBufferState,
  ) -> Result<Option<String>, String> {
    read_from_document_store(path, document_state)
  }

  pub fn cached_snapshot(
    &self,
    path: &str,
    document_state: &FsBufferState,
  ) -> Result<Option<DocumentSnapshot>, String> {
    snapshot_from_document_store(path, document_state)
  }

  pub async fn read_document(
    &self,
    state: &FsState,
    document_state: &FsBufferState,
    path: &str,
  ) -> Result<String, String> {
    if let Some(content) = self.cached_content(path, document_state)? {
      return Ok(content);
    }

    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    self
      .read_document_from_data(&data, document_state, path)
      .await
  }

  pub async fn read_document_from_data(
    &self,
    data: &FsStateData,
    document_state: &FsBufferState,
    path: &str,
  ) -> Result<String, String> {
    if let Some(content) = self.cached_content(path, document_state)? {
      return Ok(content);
    }

    let resolved = self.path_resolver.resolve(data, path)?;
    let content = tokio::fs::read_to_string(resolved)
      .await
      .map_err(|err| format!("Failed to read file: {err}"))?;
    cache_clean_document(document_state, path, &content)
  }

  pub async fn document_snapshots_for_files(
    &self,
    data: &FsStateData,
    document_state: &FsBufferState,
    files: &[FsEntry],
  ) -> Result<Vec<DocumentSnapshot>, String> {
    let mut documents = Vec::with_capacity(files.len());
    for file in files {
      let snapshot = self
        .read_document_snapshot_from_data(data, document_state, &file.path)
        .await?;
      documents.push(snapshot);
    }
    Ok(documents)
  }

  async fn read_document_snapshot_from_data(
    &self,
    data: &FsStateData,
    document_state: &FsBufferState,
    path: &str,
  ) -> Result<DocumentSnapshot, String> {
    if let Some(snapshot) = self.cached_snapshot(path, document_state)? {
      return Ok(snapshot);
    }

    let resolved = self.path_resolver.resolve(data, path)?;
    let content = tokio::fs::read_to_string(resolved)
      .await
      .map_err(|err| format!("Failed to read file: {err}"))?;
    cache_clean_document_snapshot(document_state, path, &content)
  }

  pub fn update_document(
    &self,
    state: &FsState,
    document_state: &FsBufferState,
    path: &str,
    content: &str,
  ) -> Result<FsBufferStatus, String> {
    let state_data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    let _ = self.path_resolver.resolve(&state_data, path)?;
    upsert_document(document_state, path, content)
  }

  pub fn insert_clean(
    &self,
    document_state: &FsBufferState,
    path: &str,
    content: &str,
  ) -> Result<(), String> {
    insert_clean_document(document_state, path, content)
  }

  pub fn status(
    &self,
    document_state: &FsBufferState,
    path: &str,
  ) -> Result<Option<FsBufferStatus>, String> {
    let documents = document_state
      .0
      .lock()
      .map_err(|_| "Failed to lock document state")?;
    Ok(
      documents
        .get(path)
        .map(|entry| status_from_document(path, entry)),
    )
  }

  pub fn remove_path(&self, document_state: &FsBufferState, path: &str) -> Result<(), String> {
    remove_document_path(document_state, path)
  }

  pub fn clear_clean(&self, document_state: &FsBufferState) -> Result<(), String> {
    clear_clean_documents(document_state)
  }

  pub fn rename_path(
    &self,
    document_state: &FsBufferState,
    from: &str,
    to: &str,
  ) -> Result<(), String> {
    rename_document_path(document_state, from, to)
  }

  pub fn flush_all_with_status(
    &self,
    state: &FsState,
    document_state: &FsBufferState,
  ) -> Result<Vec<FsBufferStatus>, String> {
    flush_all_documents_with_status_for_resolver(&self.path_resolver, state, document_state)
  }

  pub async fn flush_all_with_status_async(
    &self,
    state: &FsState,
    document_state: &FsBufferState,
  ) -> Result<Vec<FsBufferStatus>, String> {
    flush_all_documents_with_status_async_for_resolver(&self.path_resolver, state, document_state)
      .await
  }
}

pub fn flush_all_documents_with_status(
  state: &FsState,
  document_state: &FsBufferState,
) -> Result<Vec<FsBufferStatus>, String> {
  DocumentStoreService::default().flush_all_with_status(state, document_state)
}

fn flush_all_documents_with_status_for_resolver(
  path_resolver: &PathResolver,
  state: &FsState,
  document_state: &FsBufferState,
) -> Result<Vec<FsBufferStatus>, String> {
  let state_data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();

  let pending = {
    let documents = document_state
      .0
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

  mark_pending_writes_clean(document_state, pending)
}

async fn flush_all_documents_with_status_async_for_resolver(
  path_resolver: &PathResolver,
  state: &FsState,
  document_state: &FsBufferState,
) -> Result<Vec<FsBufferStatus>, String> {
  let state_data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();

  let pending = {
    let documents = document_state
      .0
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

  mark_pending_writes_clean(document_state, pending)
}

pub fn clear_documents(document_state: &FsBufferState) -> Result<(), String> {
  let mut documents = document_state
    .0
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  documents.clear();
  Ok(())
}

pub fn collect_dirty_writes(
  path_resolver: &PathResolver,
  state_data: &FsStateData,
  documents: &HashMap<String, FsBufferEntry>,
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

pub fn read_from_document_store(
  path: &str,
  document_state: &FsBufferState,
) -> Result<Option<String>, String> {
  let documents = document_state
    .0
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  Ok(documents.get(path).map(|entry| entry.content.clone()))
}

pub fn snapshot_from_document_store(
  path: &str,
  document_state: &FsBufferState,
) -> Result<Option<DocumentSnapshot>, String> {
  let documents = document_state
    .0
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  Ok(
    documents
      .get(path)
      .map(|entry| snapshot_from_document(path, entry)),
  )
}

pub fn upsert_document(
  document_state: &FsBufferState,
  path: &str,
  content: &str,
) -> Result<FsBufferStatus, String> {
  let mut documents = document_state
    .0
    .lock()
    .map_err(|_| "Failed to lock document state")?;

  let entry = documents.entry(path.to_string()).or_insert(FsBufferEntry {
    content: String::new(),
    dirty: false,
    revision: 0,
    saved_revision: 0,
  });
  if entry.content == content {
    return Ok(status_from_document(path, entry));
  }
  entry.content = content.to_string();
  entry.revision = entry.revision.saturating_add(1);
  entry.dirty = entry.revision != entry.saved_revision;
  Ok(status_from_document(path, entry))
}

pub fn insert_clean_document(
  document_state: &FsBufferState,
  path: &str,
  content: &str,
) -> Result<(), String> {
  let mut documents = document_state
    .0
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  documents.insert(
    path.to_string(),
    FsBufferEntry {
      content: content.to_string(),
      dirty: false,
      revision: 0,
      saved_revision: 0,
    },
  );
  Ok(())
}

fn cache_clean_document(
  document_state: &FsBufferState,
  path: &str,
  content: &str,
) -> Result<String, String> {
  let mut documents = document_state
    .0
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  if let Some(entry) = documents.get(path) {
    return Ok(entry.content.clone());
  }

  documents.insert(
    path.to_string(),
    FsBufferEntry {
      content: content.to_string(),
      dirty: false,
      revision: 0,
      saved_revision: 0,
    },
  );
  Ok(content.to_string())
}

fn cache_clean_document_snapshot(
  document_state: &FsBufferState,
  path: &str,
  content: &str,
) -> Result<DocumentSnapshot, String> {
  let mut documents = document_state
    .0
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  if let Some(entry) = documents.get(path) {
    return Ok(snapshot_from_document(path, entry));
  }

  documents.insert(
    path.to_string(),
    FsBufferEntry {
      content: content.to_string(),
      dirty: false,
      revision: 0,
      saved_revision: 0,
    },
  );
  let entry = documents
    .get(path)
    .ok_or_else(|| "Failed to cache document".to_string())?;
  Ok(snapshot_from_document(path, entry))
}

pub fn status_from_document(path: &str, entry: &FsBufferEntry) -> FsBufferStatus {
  FsBufferStatus {
    path: path.to_string(),
    revision: entry.revision,
    dirty: entry.dirty,
  }
}

pub fn snapshot_from_document(path: &str, entry: &FsBufferEntry) -> DocumentSnapshot {
  DocumentSnapshot {
    path: path.to_string(),
    content: entry.content.clone(),
    revision: entry.revision,
    dirty: entry.dirty,
  }
}

pub fn remove_document_path(document_state: &FsBufferState, path: &str) -> Result<(), String> {
  let mut documents = document_state
    .0
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  documents.retain(|key, _| !is_same_or_child(key, path));
  Ok(())
}

pub fn clear_clean_documents(document_state: &FsBufferState) -> Result<(), String> {
  let mut documents = document_state
    .0
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  documents.retain(|_, entry| entry.dirty);
  Ok(())
}

pub fn rename_document_path(
  document_state: &FsBufferState,
  from: &str,
  to: &str,
) -> Result<(), String> {
  let mut documents = document_state
    .0
    .lock()
    .map_err(|_| "Failed to lock document state")?;

  let keys: Vec<String> = documents.keys().cloned().collect();
  for key in keys {
    if !is_same_or_child(&key, from) {
      continue;
    }
    if let Some(entry) = documents.remove(&key) {
      let suffix = key.strip_prefix(from).unwrap_or_default();
      let next_key = format!("{to}{suffix}");
      documents.insert(next_key, entry);
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

fn mark_pending_writes_clean(
  document_state: &FsBufferState,
  pending: Vec<PendingDocumentWrite>,
) -> Result<Vec<FsBufferStatus>, String> {
  let mut documents = document_state
    .0
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

fn is_same_or_child(path: &str, base: &str) -> bool {
  path == base || path.starts_with(&format!("{base}/"))
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::{Mutex, RwLock};
  use std::time::{SystemTime, UNIX_EPOCH};

  fn temp_root() -> PathBuf {
    std::env::temp_dir().join(format!(
      "marko-document-store-test-{}",
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time should be valid")
        .as_nanos()
    ))
  }

  fn test_state(root: &Path) -> FsState {
    FsState(RwLock::new(FsStateData {
      root_kind: "external".to_string(),
      root_path: root.to_path_buf(),
      internal_root: root.to_path_buf(),
      single_file: None,
    }))
  }

  #[tokio::test]
  async fn reads_updates_and_flushes_documents() {
    let root = temp_root();
    fs::create_dir_all(&root).expect("test root should be created");
    fs::write(root.join("note.md"), "from disk").expect("test file should be written");

    let store = DocumentStoreService::default();
    let state = test_state(&root);
    let document_state = FsBufferState(Mutex::new(HashMap::new()));

    let initial = store
      .read_document(&state, &document_state, "note.md")
      .await
      .expect("document should load");
    assert_eq!(initial, "from disk");

    let dirty = store
      .update_document(&state, &document_state, "note.md", "from memory")
      .expect("document should update");
    assert!(dirty.dirty);

    let statuses = store
      .flush_all_with_status_async(&state, &document_state)
      .await
      .expect("documents should flush");
    assert_eq!(statuses.len(), 1);
    assert!(!statuses[0].dirty);
    assert_eq!(
      fs::read_to_string(root.join("note.md")).expect("file should be readable"),
      "from memory"
    );
  }

  #[test]
  fn renames_cached_document_paths() {
    let store = DocumentStoreService::default();
    let document_state = FsBufferState(Mutex::new(HashMap::new()));
    store
      .insert_clean(&document_state, "docs/a.md", "content")
      .expect("document should cache");

    store
      .rename_path(&document_state, "docs", "notes")
      .expect("document path should rename");

    assert!(store
      .cached_content("docs/a.md", &document_state)
      .expect("cache should read")
      .is_none());
    assert_eq!(
      store
        .cached_content("notes/a.md", &document_state)
        .expect("cache should read"),
      Some("content".to_string())
    );
  }

  #[tokio::test]
  async fn snapshots_include_revision_and_dirty_state() {
    let root = temp_root();
    fs::create_dir_all(&root).expect("test root should be created");
    fs::write(root.join("note.md"), "hello").expect("test file should be written");

    let store = DocumentStoreService::default();
    let state = test_state(&root);
    let data = state.0.read().expect("state should lock").clone();
    let document_state = FsBufferState(Mutex::new(HashMap::new()));
    let files = vec![FsEntry {
      path: "note.md".to_string(),
      name: "note.md".to_string(),
      kind: "file".to_string(),
    }];

    let snapshots = store
      .document_snapshots_for_files(&data, &document_state, &files)
      .await
      .expect("snapshots should load");
    assert_eq!(snapshots[0].revision, 0);
    assert!(!snapshots[0].dirty);

    store
      .update_document(&state, &document_state, "note.md", "updated")
      .expect("document should update");
    let snapshots = store
      .document_snapshots_for_files(&data, &document_state, &files)
      .await
      .expect("snapshots should load");
    assert_eq!(snapshots[0].revision, 1);
    assert!(snapshots[0].dirty);
    assert_eq!(snapshots[0].content, "updated");
  }

  #[test]
  fn clears_clean_documents_and_keeps_dirty_documents() {
    let root = temp_root();
    fs::create_dir_all(&root).expect("test root should be created");

    let store = DocumentStoreService::default();
    let state = test_state(&root);
    let document_state = FsBufferState(Mutex::new(HashMap::new()));
    store
      .insert_clean(&document_state, "clean.md", "clean")
      .expect("clean document should cache");
    store
      .update_document(&state, &document_state, "dirty.md", "dirty")
      .expect("dirty document should update");

    store
      .clear_clean(&document_state)
      .expect("clean documents should clear");

    assert!(store
      .cached_content("clean.md", &document_state)
      .expect("cache should read")
      .is_none());
    assert_eq!(
      store
        .cached_content("dirty.md", &document_state)
        .expect("cache should read"),
      Some("dirty".to_string())
    );
  }
}
