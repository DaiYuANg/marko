use std::path::PathBuf;

use crate::models::{FsGraph, FsMarkdownDiagnostic, FsSearchResult, FsWorkspaceIndex};
use crate::services::search::SearchDocument;
use crate::state::FsState;

use super::fs::list_entries_async;
use super::model::{workspace_search_key, WorkspaceDocuments, WorkspaceIndexCache};
use super::WorkspaceService;

impl WorkspaceService {
  pub async fn workspace_index(&self, state: &FsState) -> Result<FsWorkspaceIndex, String> {
    let workspace = self.workspace_documents(state).await?;
    self.workspace_index_from_documents(workspace).await
  }

  pub async fn analyze_markdown_buffer(
    &self,
    path: String,
    content: String,
    state: &FsState,
  ) -> Result<Vec<FsMarkdownDiagnostic>, String> {
    if self.documents.cached_content(&path)?.as_deref() == Some(content.as_str()) {
      let index = self.workspace_index(state).await?;
      return Ok(self.markdown_index.diagnostics_for_file(&index, &path));
    }

    let WorkspaceDocuments {
      files, documents, ..
    } = self.workspace_documents(state).await?;
    let contents = documents
      .into_iter()
      .map(|document| {
        if document.path == path {
          (document.path, content.clone())
        } else {
          (document.path, document.content)
        }
      })
      .collect::<Vec<_>>();

    let markdown_index = self.markdown_index.clone();
    tokio::task::spawn_blocking(move || {
      let index = markdown_index.build_workspace_index(&files, &contents);
      markdown_index.diagnostics_for_file(&index, &path)
    })
    .await
    .map_err(|err| format!("Markdown analysis task failed: {err}"))
  }

  pub async fn workspace_graph(&self, state: &FsState) -> Result<FsGraph, String> {
    let index = self.workspace_index(state).await?;
    let markdown_graph = self.markdown_graph.clone();
    tokio::task::spawn_blocking(move || markdown_graph.build_workspace_graph(&index))
      .await
      .map_err(|err| format!("Workspace graph task failed: {err}"))
  }

  pub async fn rebuild_search_index(
    &self,
    index_parent: PathBuf,
    state: &FsState,
  ) -> Result<(), String> {
    let (workspace_key, signature, documents) = self.search_documents(state).await?;
    let search = self.search.clone();
    tokio::task::spawn_blocking(move || {
      search.rebuild_index_with_signature(&index_parent, &workspace_key, &documents, signature)
    })
    .await
    .map_err(|err| format!("Search index task failed: {err}"))?
  }

  pub async fn search_workspace(
    &self,
    index_parent: PathBuf,
    query: String,
    limit: usize,
    state: &FsState,
  ) -> Result<Vec<FsSearchResult>, String> {
    let (workspace_key, signature, documents) = self.search_documents(state).await?;
    let search = self.search.clone();
    tokio::task::spawn_blocking(move || {
      search.rebuild_index_with_signature(&index_parent, &workspace_key, &documents, signature)?;
      search.search(&index_parent, &workspace_key, &query, limit)
    })
    .await
    .map_err(|err| format!("Search task failed: {err}"))?
  }

  pub async fn outline_graph(&self, path: &str, state: &FsState) -> Result<FsGraph, String> {
    let content = self.read_file(path, state).await?;
    let path = path.to_string();
    let markdown_graph = self.markdown_graph.clone();
    tokio::task::spawn_blocking(move || markdown_graph.build_outline_graph(&path, &content))
      .await
      .map_err(|err| format!("Outline graph task failed: {err}"))
  }

  pub fn clear_index_cache(&self) {
    match self.index_cache.lock() {
      Ok(mut cache) => {
        *cache = None;
      }
      Err(_) => {
        log::warn!("clear workspace index cache failed: poisoned mutex");
      }
    }
  }

  async fn workspace_index_from_documents(
    &self,
    workspace: WorkspaceDocuments,
  ) -> Result<FsWorkspaceIndex, String> {
    let signature = workspace.signature();
    if let Some(index) = self.cached_workspace_index(&workspace.workspace_key, signature)? {
      return Ok(index);
    }

    let documents = workspace.documents;
    let document_store = self.documents.clone();
    let markdown_index = self.markdown_index.clone();
    let files = workspace.files;
    let index = tokio::task::spawn_blocking(move || {
      let parsed_documents = document_store.parsed_markdown_documents_for_snapshots(&documents)?;
      Ok::<_, String>(
        markdown_index.build_workspace_index_from_documents(&files, &parsed_documents),
      )
    })
    .await
    .map_err(|err| format!("Workspace index task failed: {err}"))??;
    self.store_workspace_index_cache(workspace.workspace_key, signature, index.clone())?;
    Ok(index)
  }

  fn cached_workspace_index(
    &self,
    workspace_key: &str,
    signature: u64,
  ) -> Result<Option<FsWorkspaceIndex>, String> {
    let cache = self
      .index_cache
      .lock()
      .map_err(|_| "Failed to lock workspace index cache")?;
    Ok(cache.as_ref().and_then(|cache| {
      if cache.workspace_key == workspace_key && cache.signature == signature {
        Some(cache.index.clone())
      } else {
        None
      }
    }))
  }

  fn store_workspace_index_cache(
    &self,
    workspace_key: String,
    signature: u64,
    index: FsWorkspaceIndex,
  ) -> Result<(), String> {
    let mut cache = self
      .index_cache
      .lock()
      .map_err(|_| "Failed to lock workspace index cache")?;
    *cache = Some(WorkspaceIndexCache {
      workspace_key,
      signature,
      index,
    });
    Ok(())
  }

  async fn workspace_documents(&self, state: &FsState) -> Result<WorkspaceDocuments, String> {
    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    let workspace_key = workspace_search_key(&data);
    let entries = list_entries_async(data.clone()).await?;
    let files = entries
      .into_iter()
      .filter(|entry| entry.kind == "file")
      .collect::<Vec<_>>();
    let documents = self
      .documents
      .document_snapshots_for_files(&data, &files)
      .await?;

    Ok(WorkspaceDocuments {
      workspace_key,
      files,
      documents,
    })
  }

  async fn search_documents(
    &self,
    state: &FsState,
  ) -> Result<(String, u64, Vec<SearchDocument>), String> {
    let workspace = self.workspace_documents(state).await?;
    Ok(workspace.into_search_documents())
  }
}
