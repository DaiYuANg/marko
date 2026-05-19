use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use crate::models::{FsBufferStatus, FsEntry, FsPathMetadata, FsRootInfo, FsSnapshot};
use crate::state::FsState;

use super::fs::{
  ensure_default_file_async, ensure_workspace_mode, is_markdown, list_entries_async,
};
use super::WorkspaceService;

impl WorkspaceService {
  pub fn root_info(&self, state: &FsState) -> Result<FsRootInfo, String> {
    let data = state.0.read().map_err(|_| "Failed to lock fs state")?;
    Ok(FsRootInfo {
      kind: data.root_kind.clone(),
      path: data.root_path.to_string_lossy().to_string(),
    })
  }

  pub async fn snapshot(&self, state: &FsState) -> Result<FsSnapshot, String> {
    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    let entries = list_entries_async(data.clone()).await?;
    Ok(FsSnapshot {
      root: FsRootInfo {
        kind: data.root_kind,
        path: data.root_path.to_string_lossy().to_string(),
      },
      entries,
    })
  }

  pub async fn set_root(
    &self,
    path: Option<String>,
    state: &FsState,
  ) -> Result<FsRootInfo, String> {
    let selected_root = match path {
      Some(path) => {
        let root = PathBuf::from(path);
        let metadata = tokio::fs::metadata(&root)
          .await
          .map_err(|_| "Selected path is not a directory".to_string())?;
        if !metadata.is_dir() {
          return Err("Selected path is not a directory".to_string());
        }
        Some(root)
      }
      None => None,
    };

    let root_info = {
      let mut data = state.0.write().map_err(|_| "Failed to lock fs state")?;
      match selected_root {
        Some(root) => {
          data.root_kind = "external".to_string();
          data.root_path = root;
          data.single_file = None;
        }
        None => {
          data.root_kind = "internal".to_string();
          data.root_path = data.internal_root.clone();
          data.single_file = None;
        }
      }
      FsRootInfo {
        kind: data.root_kind.clone(),
        path: data.root_path.to_string_lossy().to_string(),
      }
    };

    if root_info.kind == "internal" {
      ensure_default_file_async(PathBuf::from(&root_info.path)).await?;
    }

    self.documents.clear()?;
    self.clear_index_cache();
    Ok(root_info)
  }

  pub async fn set_single_file(&self, path: String, state: &FsState) -> Result<FsRootInfo, String> {
    let file_path = PathBuf::from(path);
    let metadata = tokio::fs::metadata(&file_path)
      .await
      .map_err(|_| "Selected path is not a file".to_string())?;
    if !metadata.is_file() {
      return Err("Selected path is not a file".to_string());
    }
    if !is_markdown(&file_path) {
      return Err("Selected file is not a Markdown file".to_string());
    }

    let root_info = {
      let mut data = state.0.write().map_err(|_| "Failed to lock fs state")?;
      data.root_kind = "single".to_string();
      data.root_path = file_path.clone();
      data.single_file = Some(file_path.clone());
      FsRootInfo {
        kind: data.root_kind.clone(),
        path: data.root_path.to_string_lossy().to_string(),
      }
    };

    self.documents.clear()?;
    self.clear_index_cache();
    Ok(root_info)
  }

  pub async fn list_entries(&self, state: &FsState) -> Result<Vec<FsEntry>, String> {
    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    list_entries_async(data).await
  }

  pub async fn read_file(&self, path: &str, state: &FsState) -> Result<String, String> {
    self.documents.read_document(state, path).await
  }

  pub async fn open_file(&self, path: &str, state: &FsState) -> Result<String, String> {
    self.documents.read_document(state, path).await
  }

  pub fn update_buffer(
    &self,
    path: &str,
    content: &str,
    state: &FsState,
  ) -> Result<FsBufferStatus, String> {
    self.documents.update_document(state, path, content)
  }

  pub async fn flush_buffers(&self, state: &FsState) -> Result<Vec<FsBufferStatus>, String> {
    self.documents.flush_all_with_status_async(state).await
  }

  pub async fn path_metadata(
    &self,
    path: String,
    state: &FsState,
  ) -> Result<FsPathMetadata, String> {
    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    let resolved = self.path_resolver.resolve(&data, &path)?;
    let metadata = tokio::fs::metadata(&resolved)
      .await
      .map_err(|err| format!("Failed to read metadata: {err}"))?;

    let modified_ms = metadata
      .modified()
      .ok()
      .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
      .map(|duration| duration.as_millis());

    Ok(FsPathMetadata {
      path,
      absolute_path: resolved.to_string_lossy().to_string(),
      kind: if metadata.is_dir() {
        "folder".to_string()
      } else {
        "file".to_string()
      },
      size_bytes: metadata.len(),
      modified_ms,
      readonly: metadata.permissions().readonly(),
    })
  }

  pub fn write_file_buffered(
    &self,
    path: &str,
    content: &str,
    state: &FsState,
  ) -> Result<(), String> {
    self.update_buffer(path, content, state).map(|_| ())
  }

  pub async fn create_file(&self, path: String, state: &FsState) -> Result<(), String> {
    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    ensure_workspace_mode(&data)?;
    let resolved = self.path_resolver.resolve(&data, &path)?;
    if let Some(parent) = resolved.parent() {
      tokio::fs::create_dir_all(parent)
        .await
        .map_err(|err| format!("Failed to create dir: {err}"))?;
    }
    let created = if !tokio::fs::try_exists(&resolved)
      .await
      .map_err(|err| format!("Failed to check file: {err}"))?
    {
      tokio::fs::write(resolved, "")
        .await
        .map_err(|err| format!("Failed to create file: {err}"))?;
      true
    } else {
      false
    };

    if created {
      self.documents.insert_clean(&path, "")?;
    } else {
      self.documents.remove_path(&path)?;
    }
    self.clear_index_cache();
    Ok(())
  }

  pub async fn create_dir(&self, path: String, state: &FsState) -> Result<(), String> {
    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    ensure_workspace_mode(&data)?;
    let resolved = self.path_resolver.resolve(&data, &path)?;
    tokio::fs::create_dir_all(resolved)
      .await
      .map_err(|err| format!("Failed to create dir: {err}"))?;
    self.clear_index_cache();
    Ok(())
  }

  pub async fn delete_path(&self, path: String, state: &FsState) -> Result<(), String> {
    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    ensure_workspace_mode(&data)?;
    let resolved = self.path_resolver.resolve(&data, &path)?;
    let metadata = tokio::fs::metadata(&resolved)
      .await
      .map_err(|err| format!("Failed to read metadata: {err}"))?;
    if metadata.is_dir() {
      tokio::fs::remove_dir_all(resolved)
        .await
        .map_err(|err| format!("Failed to delete dir: {err}"))?;
    } else {
      tokio::fs::remove_file(resolved)
        .await
        .map_err(|err| format!("Failed to delete file: {err}"))?;
    }
    self.documents.remove_path(&path)?;
    self.clear_index_cache();
    Ok(())
  }

  pub async fn rename_path(&self, from: String, to: String, state: &FsState) -> Result<(), String> {
    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    ensure_workspace_mode(&data)?;
    let from_path = self.path_resolver.resolve(&data, &from)?;
    let to_path = self.path_resolver.resolve(&data, &to)?;
    if let Some(parent) = to_path.parent() {
      tokio::fs::create_dir_all(parent)
        .await
        .map_err(|err| format!("Failed to create dir: {err}"))?;
    }
    tokio::fs::rename(from_path, to_path)
      .await
      .map_err(|err| format!("Failed to rename: {err}"))?;
    self.documents.rename_path(&from, &to)?;
    self.clear_index_cache();
    Ok(())
  }

  pub async fn move_path(&self, from: String, to: String, state: &FsState) -> Result<(), String> {
    self.rename_path(from, to, state).await
  }
}
