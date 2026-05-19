use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::models::{FsEntry, FsWorkspaceIndex};
use crate::services::document_store::DocumentSnapshot;
use crate::services::search::SearchDocument;
use crate::state::FsStateData;

#[derive(Debug, Clone)]
pub(super) struct WorkspaceIndexCache {
  pub(super) workspace_key: String,
  pub(super) signature: u64,
  pub(super) index: FsWorkspaceIndex,
}

#[derive(Debug, Clone)]
pub(super) struct WorkspaceDocuments {
  pub(super) workspace_key: String,
  pub(super) files: Vec<FsEntry>,
  pub(super) documents: Vec<DocumentSnapshot>,
}

impl WorkspaceDocuments {
  pub(super) fn signature(&self) -> u64 {
    workspace_documents_signature(&self.workspace_key, &self.files, &self.documents)
  }

  pub(super) fn into_search_documents(self) -> (String, u64, Vec<SearchDocument>) {
    let signature = self.signature();
    let documents = self
      .documents
      .into_iter()
      .map(|document| SearchDocument {
        title: file_label(&document.path),
        path: document.path,
        body: document.content,
      })
      .collect();
    (self.workspace_key, signature, documents)
  }
}

pub(super) fn workspace_search_key(data: &FsStateData) -> String {
  format!("{}:{}", data.root_kind, data.root_path.to_string_lossy())
}

fn file_label(path: &str) -> String {
  let file_name = path.rsplit('/').next().unwrap_or(path);
  file_name
    .strip_suffix(".markdown")
    .or_else(|| file_name.strip_suffix(".md"))
    .unwrap_or(file_name)
    .to_string()
}

fn workspace_documents_signature(
  workspace_key: &str,
  files: &[FsEntry],
  documents: &[DocumentSnapshot],
) -> u64 {
  let mut hash = DefaultHasher::new();
  workspace_key.hash(&mut hash);
  files.len().hash(&mut hash);
  for file in files {
    file.path.hash(&mut hash);
    file.name.hash(&mut hash);
    file.kind.hash(&mut hash);
  }
  for document in documents {
    document.path.hash(&mut hash);
    document.content_hash.hash(&mut hash);
  }
  hash.finish()
}
