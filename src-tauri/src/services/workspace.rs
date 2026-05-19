mod files;
mod fs;
mod index;
mod model;

use std::sync::{Arc, Mutex};

use fluxdi::Shared;

use crate::services::{
  document_store::DocumentStoreService, markdown_graph::MarkdownGraphService,
  markdown_index::MarkdownIndexService, path_resolver::PathResolver, search::SearchService,
};

use self::model::WorkspaceIndexCache;

pub use self::fs::ensure_default_file;

#[derive(Debug, Clone)]
pub struct WorkspaceService {
  path_resolver: Shared<PathResolver>,
  documents: Shared<DocumentStoreService>,
  markdown_index: Shared<MarkdownIndexService>,
  markdown_graph: Shared<MarkdownGraphService>,
  search: Shared<SearchService>,
  index_cache: Arc<Mutex<Option<WorkspaceIndexCache>>>,
}

impl WorkspaceService {
  pub fn new(
    path_resolver: Shared<PathResolver>,
    documents: Shared<DocumentStoreService>,
    markdown_index: Shared<MarkdownIndexService>,
    markdown_graph: Shared<MarkdownGraphService>,
    search: Shared<SearchService>,
  ) -> Self {
    Self {
      path_resolver,
      documents,
      markdown_index,
      markdown_graph,
      search,
      index_cache: Arc::new(Mutex::new(None)),
    }
  }
}

impl Default for WorkspaceService {
  fn default() -> Self {
    let path_resolver = Shared::new(PathResolver);
    let documents = Shared::new(DocumentStoreService::new(path_resolver.clone()));
    Self::new(
      path_resolver,
      documents,
      Shared::new(MarkdownIndexService),
      Shared::new(MarkdownGraphService),
      Shared::new(SearchService::new()),
    )
  }
}
