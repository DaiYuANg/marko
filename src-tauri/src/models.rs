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
pub struct BackgroundTaskStatus {
  pub id: String,
  pub label: String,
  pub status: String,
  pub message: Option<String>,
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
pub struct FsGraphNode {
  pub id: String,
  pub kind: String,
  pub label: String,
  pub path: Option<String>,
  pub line: Option<usize>,
  pub level: Option<u8>,
  pub slug: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FsGraphEdge {
  pub id: String,
  pub source: String,
  pub target: String,
  pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FsGraph {
  pub mode: String,
  pub nodes: Vec<FsGraphNode>,
  pub edges: Vec<FsGraphEdge>,
}
