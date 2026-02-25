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
