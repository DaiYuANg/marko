use std::path::{Component, Path, PathBuf};

use path_clean::PathClean;

use crate::state::FsStateData;

#[derive(Debug, Default, Clone, Copy)]
pub struct PathResolver;

impl PathResolver {
  pub fn resolve(&self, data: &FsStateData, relative: &str) -> Result<PathBuf, String> {
    resolve_path(data, relative)
  }
}

pub fn resolve_path(data: &FsStateData, relative: &str) -> Result<PathBuf, String> {
  if relative.trim().is_empty() {
    return Err("Path must not be empty".to_string());
  }
  let rel = Path::new(relative).clean();
  if rel.is_absolute() {
    return Err("Path must be relative".to_string());
  }
  for component in rel.components() {
    if matches!(
      component,
      Component::ParentDir | Component::RootDir | Component::Prefix(_)
    ) {
      return Err("Parent paths are not allowed".to_string());
    }
  }

  if data.root_kind == "single" {
    let single_file = data
      .single_file
      .as_ref()
      .ok_or_else(|| "Single-file path is not set".to_string())?;
    let file_name = single_file
      .file_name()
      .and_then(|name| name.to_str())
      .ok_or_else(|| "Invalid file name".to_string())?;
    let normalized_rel = rel.to_string_lossy().replace('\\', "/");
    if normalized_rel != file_name {
      return Err("Single-file mode only allows operations on the opened file".to_string());
    }
    return Ok(single_file.clone());
  }

  Ok(data.root_path.join(rel))
}
