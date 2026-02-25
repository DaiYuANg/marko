use notify::RecommendedWatcher;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
use tokio::sync::mpsc::UnboundedSender;

use crate::models::FsFileUpdate;

#[derive(Debug, Clone)]
pub struct FsStateData {
  pub root_kind: String,
  pub root_path: PathBuf,
  pub internal_root: PathBuf,
}

pub struct FsState(pub RwLock<FsStateData>);

pub struct FsWatcherState(pub Mutex<Option<RecommendedWatcher>>);

/// channel used to enqueue file write requests; the worker lives in a
/// background task so disk operations do not block the Tauri command
/// thread.
pub struct FsWriteQueue(pub Mutex<Option<UnboundedSender<FsFileUpdate>>>);