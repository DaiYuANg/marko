use std::fs;
use std::path::{Path, PathBuf};

use crate::models::MarkdownFile;

#[tauri::command]
pub fn list_markdown_files(root: String) -> Result<Vec<MarkdownFile>, String> {
  let root_path = PathBuf::from(root);
  if !root_path.exists() {
    return Err("Project path does not exist".to_string());
  }
  if !root_path.is_dir() {
    return Err("Project path is not a directory".to_string());
  }

  let mut files = Vec::new();
  collect_markdown_files(&root_path, &root_path, &mut files)?;
  files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
  Ok(files)
}

#[tauri::command]
pub fn read_markdown_file(path: String) -> Result<String, String> {
  fs::read_to_string(path).map_err(|err| format!("Failed to read file: {err}"))
}

#[tauri::command]
pub fn write_markdown_file(path: String, content: String) -> Result<(), String> {
  fs::write(path, content).map_err(|err| format!("Failed to write file: {err}"))
}

fn collect_markdown_files(
  root: &Path,
  current: &Path,
  out: &mut Vec<MarkdownFile>,
) -> Result<(), String> {
  let entries = fs::read_dir(current).map_err(|err| format!("Failed to read dir: {err}"))?;
  for entry in entries {
    let entry = entry.map_err(|err| format!("Failed to read entry: {err}"))?;
    let path = entry.path();
    if path.is_dir() {
      collect_markdown_files(root, &path, out)?;
      continue;
    }
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
      if ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown") {
        let relative_path = path
          .strip_prefix(root)
          .unwrap_or(&path)
          .to_string_lossy()
          .replace('\\', "/");
        out.push(MarkdownFile {
          path: path.to_string_lossy().to_string(),
          relative_path,
        });
      }
    }
  }
  Ok(())
}
