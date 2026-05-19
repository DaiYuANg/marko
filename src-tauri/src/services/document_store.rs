mod cache;
mod entry;
mod flush;

#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use fluxdi::Shared;

use crate::models::{FsBufferStatus, FsEntry};
use crate::services::markdown_index::ParsedMarkdownDocument;
use crate::services::path_resolver::PathResolver;
use crate::state::{FsState, FsStateData};

use self::cache::{
  cache_clean_document, cache_clean_document_snapshot, clear_clean_document_count,
  clear_clean_documents, clear_documents, insert_clean_document, invalidate_clean_document_paths,
  is_workspace_root_path, parsed_markdown_documents_for_snapshots, read_from_document_store,
  remove_document_path, rename_document_path, snapshot_from_document_store, status_from_document,
  upsert_document,
};
pub use self::entry::DocumentSnapshot;
use self::entry::DocumentStoreEntry;
use self::flush::{
  flush_all_documents_with_status_async_for_resolver, flush_all_documents_with_status_for_resolver,
};

#[derive(Debug, Clone)]
pub struct DocumentStoreService {
  path_resolver: Shared<PathResolver>,
  documents: Arc<Mutex<HashMap<String, DocumentStoreEntry>>>,
}

impl DocumentStoreService {
  pub fn new(path_resolver: Shared<PathResolver>) -> Self {
    Self {
      path_resolver,
      documents: Arc::new(Mutex::new(HashMap::new())),
    }
  }
}

impl Default for DocumentStoreService {
  fn default() -> Self {
    Self::new(Shared::new(PathResolver))
  }
}

impl DocumentStoreService {
  pub fn clear(&self) -> Result<(), String> {
    clear_documents(&self.documents)
  }

  pub fn cached_content(&self, path: &str) -> Result<Option<String>, String> {
    read_from_document_store(path, &self.documents)
  }

  pub fn cached_snapshot(&self, path: &str) -> Result<Option<DocumentSnapshot>, String> {
    snapshot_from_document_store(path, &self.documents)
  }

  pub async fn read_document(&self, state: &FsState, path: &str) -> Result<String, String> {
    if let Some(content) = self.cached_content(path)? {
      return Ok(content);
    }

    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    self.read_document_from_data(&data, path).await
  }

  pub async fn document_snapshots_for_files(
    &self,
    data: &FsStateData,
    files: &[FsEntry],
  ) -> Result<Vec<DocumentSnapshot>, String> {
    let mut documents = Vec::with_capacity(files.len());
    for file in files {
      let snapshot = self
        .read_document_snapshot_from_data(data, &file.path)
        .await?;
      documents.push(snapshot);
    }
    Ok(documents)
  }

  pub(crate) fn parsed_markdown_documents_for_snapshots(
    &self,
    snapshots: &[DocumentSnapshot],
  ) -> Result<Vec<ParsedMarkdownDocument>, String> {
    parsed_markdown_documents_for_snapshots(&self.documents, snapshots)
  }

  pub fn update_document(
    &self,
    state: &FsState,
    path: &str,
    content: &str,
  ) -> Result<FsBufferStatus, String> {
    let state_data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    let _ = self.path_resolver.resolve(&state_data, path)?;
    upsert_document(&self.documents, path, content)
  }

  pub fn insert_clean(&self, path: &str, content: &str) -> Result<(), String> {
    insert_clean_document(&self.documents, path, content)
  }

  pub fn status(&self, path: &str) -> Result<Option<FsBufferStatus>, String> {
    let documents = self
      .documents
      .lock()
      .map_err(|_| "Failed to lock document state")?;
    Ok(
      documents
        .get(path)
        .map(|entry| status_from_document(path, entry)),
    )
  }

  pub fn remove_path(&self, path: &str) -> Result<(), String> {
    remove_document_path(&self.documents, path)
  }

  pub fn clear_clean(&self) -> Result<(), String> {
    clear_clean_documents(&self.documents)
  }

  pub fn invalidate_clean_absolute_paths(
    &self,
    state: &FsState,
    absolute_paths: &[PathBuf],
  ) -> Result<usize, String> {
    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    if absolute_paths
      .iter()
      .any(|path| is_workspace_root_path(&data, path))
    {
      return clear_clean_document_count(&self.documents);
    }

    let paths = absolute_paths
      .iter()
      .filter_map(|path| self.path_resolver.relative_from_absolute(&data, path))
      .collect::<Vec<_>>();
    invalidate_clean_document_paths(&self.documents, &paths)
  }

  pub fn rename_path(&self, from: &str, to: &str) -> Result<(), String> {
    rename_document_path(&self.documents, from, to)
  }

  pub fn has_dirty(&self) -> Result<bool, String> {
    let documents = self
      .documents
      .lock()
      .map_err(|_| "Failed to lock document state")?;
    Ok(documents.values().any(|entry| entry.dirty))
  }

  pub fn flush_all_with_status(&self, state: &FsState) -> Result<Vec<FsBufferStatus>, String> {
    flush_all_documents_with_status_for_resolver(&self.path_resolver, &self.documents, state)
  }

  pub async fn flush_all_with_status_async(
    &self,
    state: &FsState,
  ) -> Result<Vec<FsBufferStatus>, String> {
    flush_all_documents_with_status_async_for_resolver(&self.path_resolver, &self.documents, state)
      .await
  }

  async fn read_document_from_data(
    &self,
    data: &FsStateData,
    path: &str,
  ) -> Result<String, String> {
    if let Some(content) = self.cached_content(path)? {
      return Ok(content);
    }

    let resolved = self.path_resolver.resolve(data, path)?;
    let content = tokio::fs::read_to_string(resolved)
      .await
      .map_err(|err| format!("Failed to read file: {err}"))?;
    cache_clean_document(&self.documents, path, &content)
  }

  async fn read_document_snapshot_from_data(
    &self,
    data: &FsStateData,
    path: &str,
  ) -> Result<DocumentSnapshot, String> {
    if let Some(snapshot) = self.cached_snapshot(path)? {
      return Ok(snapshot);
    }

    let resolved = self.path_resolver.resolve(data, path)?;
    let content = tokio::fs::read_to_string(resolved)
      .await
      .map_err(|err| format!("Failed to read file: {err}"))?;
    cache_clean_document_snapshot(&self.documents, path, &content)
  }
}
