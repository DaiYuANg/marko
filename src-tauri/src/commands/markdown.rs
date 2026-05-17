use std::fs;
use std::path::{Path, PathBuf};

use crate::models::MarkdownFile;

#[tauri::command]
pub async fn list_markdown_files(root: String) -> Result<Vec<MarkdownFile>, String> {
  tokio::task::spawn_blocking(move || list_markdown_files_blocking(PathBuf::from(root)))
    .await
    .map_err(|err| format!("Markdown list task failed: {err}"))?
}

#[tauri::command]
pub async fn read_markdown_file(path: String) -> Result<String, String> {
  tokio::fs::read_to_string(path)
    .await
    .map_err(|err| format!("Failed to read file: {err}"))
}

#[tauri::command]
pub async fn write_markdown_file(path: String, content: String) -> Result<(), String> {
  tokio::fs::write(path, content)
    .await
    .map_err(|err| format!("Failed to write file: {err}"))
}

fn list_markdown_files_blocking(root_path: PathBuf) -> Result<Vec<MarkdownFile>, String> {
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
