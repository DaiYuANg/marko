use tauri::State;

use crate::models::{GitFileDiff, GitRepoInfo, GitStatusSnapshot};
use crate::services::AppServices;

#[tauri::command]
pub async fn git_discover_repo(
  root_path: String,
  services: State<'_, AppServices>,
) -> Result<GitRepoInfo, String> {
  services.git.discover(root_path).await
}

#[tauri::command]
pub async fn git_init_repo(
  root_path: String,
  services: State<'_, AppServices>,
) -> Result<GitRepoInfo, String> {
  services.git.init(root_path).await
}

#[tauri::command]
pub async fn git_get_status(
  root_path: String,
  services: State<'_, AppServices>,
) -> Result<GitStatusSnapshot, String> {
  services.git.status(root_path).await
}

#[tauri::command]
pub async fn git_get_file_diff(
  root_path: String,
  path: String,
  section: Option<String>,
  services: State<'_, AppServices>,
) -> Result<GitFileDiff, String> {
  services.git.file_diff(root_path, path, section).await
}
