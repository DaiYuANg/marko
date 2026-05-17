use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tantivy::collector::TopDocs;
use tantivy::directory::MmapDirectory;
use tantivy::query::QueryParser;
use tantivy::schema::{Field, OwnedValue, Schema, TantivyDocument, STORED, STRING, TEXT};
use tantivy::{doc, Index};

use crate::models::FsSearchResult;

const SEARCH_INDEX_VERSION: &str = "v1";
const SEARCH_MEMORY_BUDGET_BYTES: usize = 50_000_000;

#[derive(Debug, Clone)]
pub struct SearchDocument {
  pub path: String,
  pub title: String,
  pub body: String,
}

#[derive(Debug)]
pub struct SearchService {
  signatures: Mutex<HashMap<String, u64>>,
}

#[derive(Clone, Copy)]
struct SearchFields {
  path: Field,
  title: Field,
  body: Field,
}

impl SearchService {
  pub fn new() -> Self {
    Self {
      signatures: Mutex::new(HashMap::new()),
    }
  }

  pub fn rebuild_index(
    &self,
    index_parent: &Path,
    workspace_key: &str,
    documents: &[SearchDocument],
  ) -> Result<(), String> {
    let index_dir = workspace_index_dir(index_parent, workspace_key);
    let signature = documents_signature(workspace_key, documents);
    let cache_key = index_dir.to_string_lossy().to_string();
    if self.signature_matches(&cache_key, signature)? && index_dir.join("meta.json").exists() {
      return Ok(());
    }

    fs::create_dir_all(&index_dir)
      .map_err(|err| format!("Failed to create search index: {err}"))?;
    let (index, fields) = open_or_reset_index(&index_dir)?;
    let mut writer = index
      .writer(SEARCH_MEMORY_BUDGET_BYTES)
      .map_err(|err| format!("Failed to create search index writer: {err}"))?;
    writer
      .delete_all_documents()
      .map_err(|err| format!("Failed to clear search index: {err}"))?;
    for document in documents {
      writer
        .add_document(doc!(
          fields.path => document.path.clone(),
          fields.title => document.title.clone(),
          fields.body => document.body.clone(),
        ))
        .map_err(|err| format!("Failed to index document: {err}"))?;
    }
    writer
      .commit()
      .map_err(|err| format!("Failed to commit search index: {err}"))?;
    self.store_signature(cache_key, signature)
  }

  pub fn search(
    &self,
    index_parent: &Path,
    workspace_key: &str,
    query: &str,
    limit: usize,
  ) -> Result<Vec<FsSearchResult>, String> {
    let normalized_query = query.trim();
    if normalized_query.is_empty() {
      return Ok(Vec::new());
    }

    let index_dir = workspace_index_dir(index_parent, workspace_key);
    if !index_dir.join("meta.json").exists() {
      return Ok(Vec::new());
    }

    let (index, fields) = open_or_reset_index(&index_dir)?;
    let reader = index
      .reader()
      .map_err(|err| format!("Failed to open search index reader: {err}"))?;
    let searcher = reader.searcher();
    let query_parser = QueryParser::for_index(&index, vec![fields.title, fields.body, fields.path]);
    let parsed_query = query_parser
      .parse_query(normalized_query)
      .map_err(|err| format!("Failed to parse search query: {err}"))?;
    let top_docs = searcher
      .search(&parsed_query, &TopDocs::with_limit(limit.max(1).min(100)))
      .map_err(|err| format!("Failed to search index: {err}"))?;

    let mut results = Vec::with_capacity(top_docs.len());
    for (score, address) in top_docs {
      let document: TantivyDocument = searcher
        .doc(address)
        .map_err(|err| format!("Failed to read search result: {err}"))?;
      let path = get_text(&document, fields.path).unwrap_or_default();
      let title = get_text(&document, fields.title).unwrap_or_else(|| path.clone());
      let body = get_text(&document, fields.body).unwrap_or_default();
      let (line, column, snippet) = locate_snippet(&body, normalized_query);
      results.push(FsSearchResult {
        path,
        title,
        line,
        column,
        snippet,
        score,
      });
    }
    Ok(results)
  }

  fn signature_matches(&self, key: &str, signature: u64) -> Result<bool, String> {
    let signatures = self
      .signatures
      .lock()
      .map_err(|_| "Failed to lock search signature cache")?;
    Ok(signatures.get(key).copied() == Some(signature))
  }

  fn store_signature(&self, key: String, signature: u64) -> Result<(), String> {
    let mut signatures = self
      .signatures
      .lock()
      .map_err(|_| "Failed to lock search signature cache")?;
    signatures.insert(key, signature);
    Ok(())
  }
}

impl Default for SearchService {
  fn default() -> Self {
    Self::new()
  }
}

fn build_schema() -> (Schema, SearchFields) {
  let mut builder = Schema::builder();
  let path = builder.add_text_field("path", STRING | STORED);
  let title = builder.add_text_field("title", TEXT | STORED);
  let body = builder.add_text_field("body", TEXT | STORED);
  (builder.build(), SearchFields { path, title, body })
}

fn open_or_reset_index(index_dir: &Path) -> Result<(Index, SearchFields), String> {
  let (schema, fields) = build_schema();
  fs::create_dir_all(index_dir).map_err(|err| format!("Failed to create search index: {err}"))?;
  let directory = MmapDirectory::open(index_dir).map_err(|err| err.to_string())?;
  match Index::open_or_create(directory, schema.clone()) {
    Ok(index) => Ok((index, fields)),
    Err(_) => {
      fs::remove_dir_all(index_dir)
        .map_err(|err| format!("Failed to reset search index: {err}"))?;
      fs::create_dir_all(index_dir)
        .map_err(|err| format!("Failed to recreate search index: {err}"))?;
      let directory = MmapDirectory::open(index_dir).map_err(|err| err.to_string())?;
      Index::open_or_create(directory, schema)
        .map(|index| (index, fields))
        .map_err(|err| format!("Failed to open search index: {err}"))
    }
  }
}

fn workspace_index_dir(index_parent: &Path, workspace_key: &str) -> PathBuf {
  index_parent
    .join("search-indexes")
    .join(SEARCH_INDEX_VERSION)
    .join(format!("{:016x}", stable_hash(workspace_key)))
}

fn documents_signature(workspace_key: &str, documents: &[SearchDocument]) -> u64 {
  let mut hash = StableHasher::default();
  workspace_key.hash(&mut hash);
  for document in documents {
    document.path.hash(&mut hash);
    document.title.hash(&mut hash);
    document.body.hash(&mut hash);
  }
  hash.finish()
}

fn stable_hash(value: &str) -> u64 {
  let mut hash = StableHasher::default();
  value.hash(&mut hash);
  hash.finish()
}

#[derive(Default)]
struct StableHasher(u64);

impl Hasher for StableHasher {
  fn finish(&self) -> u64 {
    self.0
  }

  fn write(&mut self, bytes: &[u8]) {
    let mut hash = if self.0 == 0 {
      0xcbf29ce484222325
    } else {
      self.0
    };
    for byte in bytes {
      hash ^= u64::from(*byte);
      hash = hash.wrapping_mul(0x100000001b3);
    }
    self.0 = hash;
  }
}

fn get_text(document: &TantivyDocument, field: Field) -> Option<String> {
  match document.get_first(field) {
    Some(OwnedValue::Str(value)) => Some(value.clone()),
    _ => None,
  }
}

fn locate_snippet(body: &str, query: &str) -> (usize, usize, String) {
  let needle = query
    .split_whitespace()
    .find(|part| !part.is_empty())
    .unwrap_or(query)
    .to_lowercase();
  let lower_body = body.to_lowercase();
  let byte_index = lower_body.find(&needle).unwrap_or(0);
  let line_start = body[..byte_index]
    .rfind('\n')
    .map(|index| index + 1)
    .unwrap_or(0);
  let line_end = body[byte_index..]
    .find('\n')
    .map(|index| byte_index + index)
    .unwrap_or(body.len());
  let line = body[..byte_index].chars().filter(|ch| *ch == '\n').count() + 1;
  let column = body[line_start..byte_index].chars().count() + 1;
  let snippet = body[line_start..line_end].trim().to_string();
  (line, column, snippet)
}
