use std::hash::{Hash, Hasher};

use crate::services::markdown_index::ParsedMarkdownDocument;

#[derive(Debug, Clone)]
pub struct DocumentSnapshot {
  pub path: String,
  pub content: String,
  pub content_hash: u64,
}

#[derive(Debug, Clone)]
pub(super) struct DocumentStoreEntry {
  pub(super) content: String,
  pub(super) content_hash: u64,
  pub(super) dirty: bool,
  pub(super) revision: u64,
  pub(super) saved_revision: u64,
  pub(super) parsed_markdown: Option<ParsedMarkdownCache>,
}

#[derive(Debug, Clone)]
pub(super) struct ParsedMarkdownCache {
  pub(super) content_hash: u64,
  pub(super) document: ParsedMarkdownDocument,
}

impl DocumentStoreEntry {
  pub(super) fn clean(content: &str) -> Self {
    Self {
      content: content.to_string(),
      content_hash: stable_hash(content),
      dirty: false,
      revision: 0,
      saved_revision: 0,
      parsed_markdown: None,
    }
  }

  pub(super) fn empty() -> Self {
    Self::clean("")
  }

  pub(super) fn update_content(&mut self, content: &str) {
    self.content = content.to_string();
    self.content_hash = stable_hash(content);
    self.parsed_markdown = None;
  }
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
