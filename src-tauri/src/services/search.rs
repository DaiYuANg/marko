use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tantivy::collector::TopDocs;
use tantivy::directory::MmapDirectory;
use tantivy::query::QueryParser;
use tantivy::schema::{Field, OwnedValue, Schema, TantivyDocument, STORED, STRING, TEXT};
use tantivy::snippet::SnippetGenerator;
use tantivy::{doc, Index};

use crate::models::{FsSearchResult, FsTextRange};

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

  pub fn rebuild_index_with_signature(
    &self,
    index_parent: &Path,
    workspace_key: &str,
    documents: &[SearchDocument],
    signature: u64,
  ) -> Result<(), String> {
    let index_dir = workspace_index_dir(index_parent, workspace_key);
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
    let mut snippet_generator =
      SnippetGenerator::create(&searcher, parsed_query.as_ref(), fields.body)
        .map_err(|err| format!("Failed to create search snippet generator: {err}"))?;
    snippet_generator.set_max_num_chars(180);
    let top_docs = searcher
      .search(&parsed_query, &TopDocs::with_limit(limit.clamp(1, 100)))
      .map_err(|err| format!("Failed to search index: {err}"))?;

    let mut results = Vec::with_capacity(top_docs.len());
    for (score, address) in top_docs {
      let document: TantivyDocument = searcher
        .doc(address)
        .map_err(|err| format!("Failed to read search result: {err}"))?;
      let path = get_text(&document, fields.path).unwrap_or_default();
      let title = get_text(&document, fields.title).unwrap_or_else(|| path.clone());
      let body = get_text(&document, fields.body).unwrap_or_default();
      let (line, column, end_column, fallback_snippet) = locate_match(&body, normalized_query);
      let snippet = snippet_generator.snippet_from_doc(&document);
      let (snippet, snippet_highlights) = if snippet.is_empty() {
        (fallback_snippet, Vec::new())
      } else {
        (
          snippet.fragment().trim().to_string(),
          snippet_highlights(snippet.fragment(), snippet.highlighted()),
        )
      };
      results.push(FsSearchResult {
        path,
        title,
        line,
        column,
        end_column,
        snippet,
        snippet_highlights,
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

fn locate_match(body: &str, query: &str) -> (usize, usize, usize, String) {
  let (byte_index, byte_end) = find_match_range(body, query).unwrap_or((0, 0));
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
  let end_column = if byte_end > byte_index {
    column + body[byte_index..byte_end].chars().count()
  } else {
    column + 1
  };
  let snippet = body[line_start..line_end].trim().to_string();
  (line, column, end_column, snippet)
}

fn find_match_range(body: &str, query: &str) -> Option<(usize, usize)> {
  search_terms(query)
    .into_iter()
    .find_map(|term| find_term_range(body, &term).map(|start| (start, start + term.len())))
}

fn search_terms(query: &str) -> Vec<String> {
  let mut terms = query
    .split_whitespace()
    .map(|part| {
      part.trim_matches(|ch: char| {
        matches!(
          ch,
          '"' | '\'' | '`' | ':' | '^' | '~' | '*' | '?' | '+' | '-' | '(' | ')' | '[' | ']'
        )
      })
    })
    .filter(|part| !part.is_empty())
    .map(ToOwned::to_owned)
    .collect::<Vec<_>>();

  if terms.is_empty() && !query.trim().is_empty() {
    terms.push(query.trim().to_string());
  }
  terms
}

fn find_term_range(body: &str, term: &str) -> Option<usize> {
  body.find(term).or_else(|| {
    if !term.is_ascii() {
      return None;
    }
    body.to_ascii_lowercase().find(&term.to_ascii_lowercase())
  })
}

fn snippet_highlights(snippet: &str, ranges: &[std::ops::Range<usize>]) -> Vec<FsTextRange> {
  let trim_start_bytes = snippet.len() - snippet.trim_start().len();
  ranges
    .iter()
    .filter_map(|range| {
      let start = range.start.saturating_sub(trim_start_bytes);
      let end = range.end.saturating_sub(trim_start_bytes);
      let trimmed = snippet.trim();
      if start >= end || start >= trimmed.len() {
        return None;
      }
      Some(FsTextRange {
        start: byte_to_char_index(trimmed, start),
        end: byte_to_char_index(trimmed, end.min(trimmed.len())),
      })
    })
    .collect()
}

fn byte_to_char_index(value: &str, byte_index: usize) -> usize {
  value
    .char_indices()
    .take_while(|(index, _)| *index < byte_index)
    .count()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn locates_match_line_and_columns() {
    let (line, column, end_column, snippet) = locate_match("one\nhello world\nlast", "hello");

    assert_eq!(line, 2);
    assert_eq!(column, 1);
    assert_eq!(end_column, 6);
    assert_eq!(snippet, "hello world");
  }

  #[test]
  fn normalizes_snippet_highlight_ranges_after_trimming() {
    let highlight = 2..7;
    let ranges = snippet_highlights("  hello world", std::slice::from_ref(&highlight));

    assert_eq!(ranges.len(), 1);
    assert_eq!(ranges[0].start, 0);
    assert_eq!(ranges[0].end, 5);
  }
}
