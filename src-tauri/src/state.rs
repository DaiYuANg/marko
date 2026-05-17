use crate::models::BackgroundTaskStatus;
use notify::RecommendedWatcher;
use notify_debouncer_mini::Debouncer;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};

#[derive(Debug, Clone)]
pub struct FsStateData {
  pub root_kind: String,
  pub root_path: PathBuf,
  pub internal_root: PathBuf,
  pub single_file: Option<PathBuf>,
}

pub struct FsState(pub RwLock<FsStateData>);

pub struct FsWatcherState(pub Mutex<Option<Debouncer<RecommendedWatcher>>>);

#[derive(Debug, Clone)]
pub struct FsBufferEntry {
  pub content: String,
  pub dirty: bool,
  pub revision: u64,
}

pub struct FsBufferState(pub Mutex<HashMap<String, FsBufferEntry>>);

pub struct BackgroundTasksState(pub Mutex<HashMap<String, BackgroundTaskStatus>>);
