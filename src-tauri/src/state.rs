use notify::RecommendedWatcher;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
use tokio::sync::mpsc::UnboundedSender;

use crate::models::FsFileUpdate;

#[derive(Debug, Clone)]
pub struct FsStateData {
  pub root_kind: String,
  pub root_path: PathBuf,
  pub internal_root: PathBuf,
  pub single_file: Option<PathBuf>,
}

pub struct FsState(pub RwLock<FsStateData>);

pub struct FsWatcherState(pub Mutex<Option<RecommendedWatcher>>);

#[derive(Debug, Clone)]
pub struct FsBufferEntry {
  pub content: String,
  pub dirty: bool,
  pub revision: u64,
}

pub struct FsBufferState(pub Mutex<HashMap<String, FsBufferEntry>>);

/// channel used to enqueue file write requests; the worker lives in a
/// background task so disk operations do not block the Tauri command
/// thread.
pub struct FsWriteQueue(pub Mutex<Option<UnboundedSender<FsFileUpdate>>>);
