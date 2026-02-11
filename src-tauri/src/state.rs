use std::path::PathBuf;
use std::sync::RwLock;

#[derive(Debug, Clone)]
pub struct FsStateData {
  pub root_kind: String,
  pub root_path: PathBuf,
  pub internal_root: PathBuf,
}

pub struct FsState(pub RwLock<FsStateData>);
