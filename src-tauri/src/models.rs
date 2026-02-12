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
pub struct FsFileUpdate {
  pub path: String,
  pub content: String,
  pub source_id: Option<String>,
}
