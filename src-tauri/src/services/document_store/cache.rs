use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use path_clean::PathClean;

use crate::models::FsBufferStatus;
use crate::services::markdown_index::{parse_markdown_document, ParsedMarkdownDocument};
use crate::state::FsStateData;

use super::entry::{DocumentSnapshot, DocumentStoreEntry, ParsedMarkdownCache};

pub(super) fn clear_documents(
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
) -> Result<(), String> {
  let mut documents = documents
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  documents.clear();
  Ok(())
}

pub(super) fn read_from_document_store(
  path: &str,
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
) -> Result<Option<String>, String> {
  let documents = documents
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  Ok(documents.get(path).map(|entry| entry.content.clone()))
}

pub(super) fn snapshot_from_document_store(
  path: &str,
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
) -> Result<Option<DocumentSnapshot>, String> {
  let documents = documents
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  Ok(
    documents
      .get(path)
      .map(|entry| snapshot_from_document(path, entry)),
  )
}

pub(super) fn parsed_markdown_documents_for_snapshots(
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
  snapshots: &[DocumentSnapshot],
) -> Result<Vec<ParsedMarkdownDocument>, String> {
  let mut parsed_documents = vec![None; snapshots.len()];
  let mut misses = Vec::new();

  {
    let documents = documents
      .lock()
      .map_err(|_| "Failed to lock document state")?;
    for (index, snapshot) in snapshots.iter().enumerate() {
      if let Some(document) = documents
        .get(&snapshot.path)
        .and_then(|entry| entry.parsed_markdown.as_ref())
        .filter(|cache| cache.content_hash == snapshot.content_hash)
        .map(|cache| cache.document.clone())
      {
        parsed_documents[index] = Some(document);
      } else {
        misses.push(index);
      }
    }
  }

  if misses.is_empty() {
    return parsed_documents
      .into_iter()
      .collect::<Option<Vec<_>>>()
      .ok_or_else(|| "Failed to read parsed markdown cache".to_string());
  }

  let parsed_misses = misses
    .into_iter()
    .map(|index| {
      let snapshot = &snapshots[index];
      (
        index,
        parse_markdown_document(&snapshot.path, &snapshot.content),
      )
    })
    .collect::<Vec<_>>();

  let mut documents = documents
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  for (index, document) in parsed_misses {
    let snapshot = &snapshots[index];
    if let Some(entry) = documents.get_mut(&snapshot.path) {
      if entry.content_hash == snapshot.content_hash {
        entry.parsed_markdown = Some(ParsedMarkdownCache {
          content_hash: snapshot.content_hash,
          document: document.clone(),
        });
      }
    }
    parsed_documents[index] = Some(document);
  }

  parsed_documents
    .into_iter()
    .collect::<Option<Vec<_>>>()
    .ok_or_else(|| "Failed to read parsed markdown cache".to_string())
}

pub(super) fn upsert_document(
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
  path: &str,
  content: &str,
) -> Result<FsBufferStatus, String> {
  let mut documents = documents
    .lock()
    .map_err(|_| "Failed to lock document state")?;

  let entry = documents
    .entry(path.to_string())
    .or_insert_with(DocumentStoreEntry::empty);
  if entry.content == content {
    return Ok(status_from_document(path, entry));
  }
  entry.update_content(content);
  entry.revision = entry.revision.saturating_add(1);
  entry.dirty = entry.revision != entry.saved_revision;
  Ok(status_from_document(path, entry))
}

pub(super) fn insert_clean_document(
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
  path: &str,
  content: &str,
) -> Result<(), String> {
  let mut documents = documents
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  documents.insert(path.to_string(), DocumentStoreEntry::clean(content));
  Ok(())
}

pub(super) fn cache_clean_document(
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
  path: &str,
  content: &str,
) -> Result<String, String> {
  let mut documents = documents
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  if let Some(entry) = documents.get(path) {
    return Ok(entry.content.clone());
  }

  documents.insert(path.to_string(), DocumentStoreEntry::clean(content));
  Ok(content.to_string())
}

pub(super) fn cache_clean_document_snapshot(
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
  path: &str,
  content: &str,
) -> Result<DocumentSnapshot, String> {
  let mut documents = documents
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  if let Some(entry) = documents.get(path) {
    return Ok(snapshot_from_document(path, entry));
  }

  documents.insert(path.to_string(), DocumentStoreEntry::clean(content));
  let entry = documents
    .get(path)
    .ok_or_else(|| "Failed to cache document".to_string())?;
  Ok(snapshot_from_document(path, entry))
}

pub(super) fn status_from_document(path: &str, entry: &DocumentStoreEntry) -> FsBufferStatus {
  FsBufferStatus {
    path: path.to_string(),
    revision: entry.revision,
    dirty: entry.dirty,
  }
}

fn snapshot_from_document(path: &str, entry: &DocumentStoreEntry) -> DocumentSnapshot {
  DocumentSnapshot {
    path: path.to_string(),
    content: entry.content.clone(),
    content_hash: entry.content_hash,
  }
}

pub(super) fn remove_document_path(
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
  path: &str,
) -> Result<(), String> {
  let mut documents = documents
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  documents.retain(|key, _| !is_same_or_child(key, path));
  Ok(())
}

pub(super) fn clear_clean_documents(
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
) -> Result<(), String> {
  clear_clean_document_count(documents).map(|_| ())
}

pub(super) fn clear_clean_document_count(
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
) -> Result<usize, String> {
  let mut documents = documents
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  let before = documents.len();
  documents.retain(|_, entry| entry.dirty);
  Ok(before.saturating_sub(documents.len()))
}

pub(super) fn invalidate_clean_document_paths(
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
  paths: &[String],
) -> Result<usize, String> {
  if paths.is_empty() {
    return Ok(0);
  }

  let mut documents = documents
    .lock()
    .map_err(|_| "Failed to lock document state")?;
  let before = documents.len();
  documents
    .retain(|key, entry| entry.dirty || !paths.iter().any(|path| is_same_or_child(key, path)));
  Ok(before.saturating_sub(documents.len()))
}

pub(super) fn rename_document_path(
  documents: &Mutex<HashMap<String, DocumentStoreEntry>>,
  from: &str,
  to: &str,
) -> Result<(), String> {
  let mut documents = documents
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

pub(super) fn is_workspace_root_path(data: &FsStateData, path: &PathBuf) -> bool {
  let path = path.clean();
  if data.root_kind == "single" {
    return data
      .single_file
      .as_ref()
      .map(|single_file| single_file.clean() == path)
      .unwrap_or(false);
  }
  data.root_path.clean() == path
}

fn is_same_or_child(path: &str, base: &str) -> bool {
  path == base || path.starts_with(&format!("{base}/"))
}
