use std::fs;
use std::path::{Path, PathBuf};

use pathdiff::diff_paths;

use crate::models::FsEntry;
use crate::state::FsStateData;

pub fn ensure_default_file(root: &Path) -> Result<(), String> {
  if !root.exists() {
    fs::create_dir_all(root).map_err(|err| format!("Failed to create dir: {err}"))?;
  }
  for entry in walkdir::WalkDir::new(root)
    .min_depth(1)
    .into_iter()
    .filter_entry(|entry| !is_hidden(entry.path()))
  {
    let entry = entry.map_err(|err| err.to_string())?;
    if entry.file_type().is_file() && is_markdown(entry.path()) {
      return Ok(());
    }
  }
  let default_path = root.join("Untitled.md");
  if !default_path.exists() {
    fs::write(default_path, "").map_err(|err| format!("Failed to create default file: {err}"))?;
  }
  Ok(())
}

pub(super) async fn ensure_default_file_async(root: PathBuf) -> Result<(), String> {
  tokio::task::spawn_blocking(move || ensure_default_file(&root))
    .await
    .map_err(|err| format!("Default file task failed: {err}"))?
}

pub fn list_entries(data: &FsStateData) -> Result<Vec<FsEntry>, String> {
  if data.root_kind == "single" {
    if let Some(single_file) = &data.single_file {
      let name = single_file
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?
        .to_string();
      return Ok(vec![FsEntry {
        path: name.clone(),
        name,
        kind: "file".to_string(),
      }]);
    }
    return Ok(vec![]);
  }

  let root = &data.root_path;
  let mut entries = Vec::new();
  if !root.exists() {
    return Ok(entries);
  }
  for entry in walkdir::WalkDir::new(root)
    .min_depth(1)
    .into_iter()
    .filter_entry(|entry| !is_hidden(entry.path()))
  {
    let entry = entry.map_err(|err| err.to_string())?;
    let path = entry.path();
    let rel = diff_paths(path, root)
      .ok_or_else(|| "Failed to compute relative path".to_string())?
      .to_string_lossy()
      .replace('\\', "/");
    if entry.file_type().is_dir() {
      entries.push(FsEntry {
        path: rel.clone(),
        name: entry.file_name().to_string_lossy().to_string(),
        kind: "folder".to_string(),
      });
      continue;
    }
    if !is_markdown(path) {
      continue;
    }
    entries.push(FsEntry {
      path: rel.clone(),
      name: entry.file_name().to_string_lossy().to_string(),
      kind: "file".to_string(),
    });
  }
  entries.sort_by(|a, b| a.path.cmp(&b.path));
  Ok(entries)
}

pub(super) async fn list_entries_async(data: FsStateData) -> Result<Vec<FsEntry>, String> {
  tokio::task::spawn_blocking(move || list_entries(&data))
    .await
    .map_err(|err| format!("List entries task failed: {err}"))?
}

pub(super) fn ensure_workspace_mode(data: &FsStateData) -> Result<(), String> {
  if data.root_kind == "single" {
    return Err("Operation is not supported in single-file mode".to_string());
  }
  Ok(())
}

fn is_hidden(path: &Path) -> bool {
  path
    .file_name()
    .and_then(|name| name.to_str())
    .map(|name| name.starts_with('.'))
    .unwrap_or(false)
}

pub fn is_markdown(path: &Path) -> bool {
  path
    .extension()
    .and_then(|ext| ext.to_str())
    .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
    .unwrap_or(false)
}
