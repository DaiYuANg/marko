use serde::Serialize;

#[derive(Serialize)]
pub struct MarkdownFile {
  pub path: String,
  pub relative_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FsEntry {
  pub path: String,
  pub name: String,
  pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FsRootInfo {
  pub kind: String,
  pub path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FsSnapshot {
  pub root: FsRootInfo,
  pub entries: Vec<FsEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FsPathMetadata {
  pub path: String,
  pub absolute_path: String,
  pub kind: String,
  pub size_bytes: u64,
  pub modified_ms: Option<u128>,
  pub readonly: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FsBufferStatus {
  pub path: String,
  pub revision: u64,
  pub dirty: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FsMarkdownHeading {
  pub path: String,
  pub level: u8,
  pub text: String,
  pub slug: String,
  pub line: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct FsMarkdownLink {
  pub source_path: String,
  pub text: String,
  pub target: String,
  pub link_type: String,
  pub target_path: Option<String>,
  pub target_anchor: Option<String>,
  pub target_heading_slug: Option<String>,
  pub is_external: bool,
  pub context: String,
  pub line: usize,
  pub column: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct FsIndexedMarkdownFile {
  pub path: String,
  pub headings: Vec<FsMarkdownHeading>,
  pub links: Vec<FsMarkdownLink>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FsWorkspaceIndex {
  pub files: Vec<FsIndexedMarkdownFile>,
}

#[derive(Debug, Clone, Serialize)]
/// represents a pending file write request. previously unused,
/// now repurposed as the message type sent to the backend write
/// worker, allowing the front end to enqueue updates without
/// performing disk I/O synchronously.
///
/// `source_id` can be supplied by callers to correlate an
/// acknowledgement/event, though it's currently unused.
pub struct FsFileUpdate {
  pub path: String,
  pub content: String,
  pub source_id: Option<String>,
}
