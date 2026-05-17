use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use fluxdi::Shared;
use pathdiff::diff_paths;

use crate::models::{
  FsBufferStatus, FsEntry, FsGraph, FsPathMetadata, FsRootInfo, FsSnapshot, FsWorkspaceIndex,
};
use crate::services::{
  fs_buffer::BufferService, markdown_graph::MarkdownGraphService,
  markdown_index::MarkdownIndexService, path_resolver::PathResolver,
};
use crate::state::{FsBufferState, FsState, FsStateData};

#[derive(Debug, Clone)]
pub struct WorkspaceService {
  path_resolver: Shared<PathResolver>,
  buffer: Shared<BufferService>,
  markdown_index: Shared<MarkdownIndexService>,
  markdown_graph: Shared<MarkdownGraphService>,
}

impl WorkspaceService {
  pub fn new(
    path_resolver: Shared<PathResolver>,
    buffer: Shared<BufferService>,
    markdown_index: Shared<MarkdownIndexService>,
    markdown_graph: Shared<MarkdownGraphService>,
  ) -> Self {
    Self {
      path_resolver,
      buffer,
      markdown_index,
      markdown_graph,
    }
  }

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
    buffer_state: &FsBufferState,
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

    self.buffer.clear(buffer_state)?;
    Ok(root_info)
  }

  pub async fn set_single_file(
    &self,
    path: String,
    state: &FsState,
    buffer_state: &FsBufferState,
  ) -> Result<FsRootInfo, String> {
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

    self.buffer.clear(buffer_state)?;
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

  pub async fn read_file(
    &self,
    path: &str,
    state: &FsState,
    buffer_state: &FsBufferState,
  ) -> Result<String, String> {
    if let Some(content) = self.buffer.read(path, buffer_state)? {
      return Ok(content);
    }
    self.read_from_disk(path, state).await
  }

  pub async fn workspace_index(
    &self,
    state: &FsState,
    buffer_state: &FsBufferState,
  ) -> Result<FsWorkspaceIndex, String> {
    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    let entries = list_entries_async(data.clone()).await?;
    let files = entries
      .into_iter()
      .filter(|entry| entry.kind == "file")
      .collect::<Vec<_>>();

    let mut contents = Vec::with_capacity(files.len());
    for file in &files {
      let content = if let Some(content) = self.buffer.read(&file.path, buffer_state)? {
        content
      } else {
        self.read_from_disk_data(&file.path, &data).await?
      };
      contents.push((file.path.clone(), content));
    }

    let markdown_index = self.markdown_index.clone();
    tokio::task::spawn_blocking(move || markdown_index.build_workspace_index(&files, &contents))
      .await
      .map_err(|err| format!("Workspace index task failed: {err}"))
  }

  pub async fn workspace_graph(
    &self,
    state: &FsState,
    buffer_state: &FsBufferState,
  ) -> Result<FsGraph, String> {
    let index = self.workspace_index(state, buffer_state).await?;
    let markdown_graph = self.markdown_graph.clone();
    tokio::task::spawn_blocking(move || markdown_graph.build_workspace_graph(&index))
      .await
      .map_err(|err| format!("Workspace graph task failed: {err}"))
  }

  pub async fn open_file(
    &self,
    path: &str,
    state: &FsState,
    buffer_state: &FsBufferState,
  ) -> Result<String, String> {
    if let Some(content) = self.buffer.read(path, buffer_state)? {
      return Ok(content);
    }

    let content = self.read_from_disk(path, state).await?;
    self.buffer.insert_clean(buffer_state, path, &content)?;
    Ok(content)
  }

  pub async fn outline_graph(
    &self,
    path: &str,
    state: &FsState,
    buffer_state: &FsBufferState,
  ) -> Result<FsGraph, String> {
    let content = self.read_file(path, state, buffer_state).await?;
    let path = path.to_string();
    let markdown_graph = self.markdown_graph.clone();
    tokio::task::spawn_blocking(move || markdown_graph.build_outline_graph(&path, &content))
      .await
      .map_err(|err| format!("Outline graph task failed: {err}"))
  }

  pub fn update_buffer(
    &self,
    path: &str,
    content: &str,
    state: &FsState,
    buffer_state: &FsBufferState,
  ) -> Result<FsBufferStatus, String> {
    let state_data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    let _ = self.path_resolver.resolve(&state_data, path)?;
    self.buffer.upsert(buffer_state, path, content)
  }

  pub async fn flush_buffers(
    &self,
    state: &FsState,
    buffer_state: &FsBufferState,
  ) -> Result<Vec<FsBufferStatus>, String> {
    self
      .buffer
      .flush_all_with_status_async(state, buffer_state)
      .await
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
    buffer_state: &FsBufferState,
  ) -> Result<(), String> {
    self
      .update_buffer(path, content, state, buffer_state)
      .map(|_| ())
  }

  pub async fn create_file(
    &self,
    path: String,
    state: &FsState,
    buffer_state: &FsBufferState,
  ) -> Result<(), String> {
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
    if !tokio::fs::try_exists(&resolved)
      .await
      .map_err(|err| format!("Failed to check file: {err}"))?
    {
      tokio::fs::write(resolved, "")
        .await
        .map_err(|err| format!("Failed to create file: {err}"))?;
    }

    self.buffer.remove_path(buffer_state, &path)?;
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
      .map_err(|err| format!("Failed to create dir: {err}"))
  }

  pub async fn delete_path(
    &self,
    path: String,
    state: &FsState,
    buffer_state: &FsBufferState,
  ) -> Result<(), String> {
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
    self.buffer.remove_path(buffer_state, &path)
  }

  pub async fn rename_path(
    &self,
    from: String,
    to: String,
    state: &FsState,
    buffer_state: &FsBufferState,
  ) -> Result<(), String> {
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
    self.buffer.rename_path(buffer_state, &from, &to)
  }

  async fn read_from_disk(&self, path: &str, state: &FsState) -> Result<String, String> {
    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    self.read_from_disk_data(path, &data).await
  }

  async fn read_from_disk_data(&self, path: &str, data: &FsStateData) -> Result<String, String> {
    let resolved = self.path_resolver.resolve(data, path)?;
    tokio::fs::read_to_string(resolved)
      .await
      .map_err(|err| format!("Failed to read file: {err}"))
  }
}

impl Default for WorkspaceService {
  fn default() -> Self {
    let path_resolver = Shared::new(PathResolver);
    let buffer = Shared::new(BufferService::new(path_resolver.clone()));
    Self::new(
      path_resolver,
      buffer,
      Shared::new(MarkdownIndexService),
      Shared::new(MarkdownGraphService),
    )
  }
}

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

async fn ensure_default_file_async(root: PathBuf) -> Result<(), String> {
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

async fn list_entries_async(data: FsStateData) -> Result<Vec<FsEntry>, String> {
  tokio::task::spawn_blocking(move || list_entries(&data))
    .await
    .map_err(|err| format!("List entries task failed: {err}"))?
}

fn ensure_workspace_mode(data: &FsStateData) -> Result<(), String> {
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
