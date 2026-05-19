use std::{
  path::PathBuf,
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
  },
  time::Duration,
};

use fluxdi::Shared;
use serde::Serialize;
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::broadcast;

use crate::state::FsState;

#[derive(Debug, Clone, Serialize)]
pub struct ExportTaskEvent {
  pub id: String,
  pub format: String,
  pub output_path: String,
  pub status: String,
  pub message: Option<String>,
}

#[derive(Debug, Clone)]
pub enum AppEvent {
  WorkspaceChanged,
  FileSystemChanged(Vec<PathBuf>),
  AssetChanged,
  DocumentChanged,
  BuffersFlushed,
  ExportTask(ExportTaskEvent),
  RuntimeStopping,
}

#[derive(Debug, Clone)]
struct CoalescedWorkspaceEvents {
  should_stop: bool,
  refresh_documents: bool,
  refresh_snapshot: bool,
  rebuild_search_index: bool,
  document_paths: Option<Vec<PathBuf>>,
}

impl Default for CoalescedWorkspaceEvents {
  fn default() -> Self {
    Self {
      should_stop: false,
      refresh_documents: false,
      refresh_snapshot: false,
      rebuild_search_index: false,
      document_paths: Some(Vec::new()),
    }
  }
}

#[derive(Debug, Clone)]
pub struct EventBus {
  sender: broadcast::Sender<AppEvent>,
}

impl EventBus {
  pub fn new(capacity: usize) -> Self {
    let (sender, _) = broadcast::channel(capacity);
    Self { sender }
  }

  pub fn publish(&self, event: AppEvent) -> Result<(), String> {
    self
      .sender
      .send(event)
      .map(|_| ())
      .map_err(|err| format!("Failed to publish app event: {err}"))
  }

  pub fn subscribe(&self) -> broadcast::Receiver<AppEvent> {
    self.sender.subscribe()
  }
}

impl Default for EventBus {
  fn default() -> Self {
    Self::new(128)
  }
}

#[derive(Debug, Clone)]
pub struct RuntimeService {
  events: Shared<EventBus>,
  container_started: Arc<AtomicBool>,
  event_worker_started: Arc<AtomicBool>,
}

impl RuntimeService {
  pub fn new(events: Shared<EventBus>) -> Self {
    Self {
      events,
      container_started: Arc::new(AtomicBool::new(false)),
      event_worker_started: Arc::new(AtomicBool::new(false)),
    }
  }

  pub fn on_container_start(&self) {
    self.container_started.store(true, Ordering::SeqCst);
  }

  pub fn on_container_stop(&self) {
    self.container_started.store(false, Ordering::SeqCst);
    let _ = self.events.sender.send(AppEvent::RuntimeStopping);
  }

  #[cfg(test)]
  pub fn is_container_started(&self) -> bool {
    self.container_started.load(Ordering::SeqCst)
  }

  pub fn start_event_worker(&self, app: &tauri::AppHandle) {
    if self
      .event_worker_started
      .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
      .is_err()
    {
      return;
    }

    start_event_worker(
      app,
      self.events.clone(),
      Arc::clone(&self.event_worker_started),
    );
  }

  pub fn publish_initial_workspace_event(&self) -> Result<(), String> {
    self.events.publish(AppEvent::WorkspaceChanged)
  }
}

fn start_event_worker(
  app: &tauri::AppHandle,
  event_bus: Shared<EventBus>,
  event_worker_started: Arc<AtomicBool>,
) {
  let app_handle = app.clone();
  let mut receiver = event_bus.subscribe();
  tokio::spawn(async move {
    loop {
      let event = match receiver.recv().await {
        Ok(event) => event,
        Err(broadcast::error::RecvError::Lagged(skipped)) => {
          log::warn!("app event worker lagged by {skipped} events");
          AppEvent::FileSystemChanged(Vec::new())
        }
        Err(broadcast::error::RecvError::Closed) => break,
      };
      match event {
        AppEvent::RuntimeStopping => break,
        AppEvent::ExportTask(payload) => emit_export_task(&app_handle, payload),
        AppEvent::WorkspaceChanged => {
          if handle_coalesced_workspace_event(&app_handle, &mut receiver, true, None, true, true)
            .await
          {
            break;
          }
        }
        AppEvent::FileSystemChanged(paths) => {
          if handle_coalesced_workspace_event(
            &app_handle,
            &mut receiver,
            true,
            if paths.is_empty() { None } else { Some(paths) },
            true,
            true,
          )
          .await
          {
            break;
          }
        }
        AppEvent::AssetChanged | AppEvent::DocumentChanged | AppEvent::BuffersFlushed => {
          let rebuild_search_index = !matches!(event, AppEvent::AssetChanged);
          if handle_coalesced_workspace_event(
            &app_handle,
            &mut receiver,
            false,
            Some(Vec::new()),
            true,
            rebuild_search_index,
          )
          .await
          {
            break;
          }
        }
      }
    }
    event_worker_started.store(false, Ordering::SeqCst);
  });
}

async fn handle_coalesced_workspace_event(
  app: &tauri::AppHandle,
  receiver: &mut broadcast::Receiver<AppEvent>,
  refresh_documents: bool,
  document_paths: Option<Vec<PathBuf>>,
  refresh_snapshot: bool,
  rebuild_search_index: bool,
) -> bool {
  let coalesced = coalesce_workspace_events(app, receiver).await;
  if coalesced.should_stop {
    return true;
  }
  handle_workspace_event(
    app,
    refresh_documents || coalesced.refresh_documents,
    merge_document_paths(document_paths, coalesced.document_paths),
    refresh_snapshot || coalesced.refresh_snapshot,
    rebuild_search_index || coalesced.rebuild_search_index,
  )
  .await;
  false
}

async fn coalesce_workspace_events(
  app: &tauri::AppHandle,
  receiver: &mut broadcast::Receiver<AppEvent>,
) -> CoalescedWorkspaceEvents {
  tokio::time::sleep(Duration::from_millis(80)).await;

  let mut coalesced = CoalescedWorkspaceEvents::default();
  loop {
    match receiver.try_recv() {
      Ok(AppEvent::WorkspaceChanged) => {
        coalesced.refresh_documents = true;
        coalesced.refresh_snapshot = true;
        coalesced.rebuild_search_index = true;
        coalesced.document_paths = None;
      }
      Ok(AppEvent::FileSystemChanged(paths)) => {
        coalesced.refresh_documents = true;
        coalesced.refresh_snapshot = true;
        coalesced.rebuild_search_index = true;
        if paths.is_empty() {
          coalesced.document_paths = None;
        } else if let Some(document_paths) = coalesced.document_paths.as_mut() {
          document_paths.extend(paths);
        }
      }
      Ok(AppEvent::AssetChanged) => {
        coalesced.refresh_snapshot = true;
      }
      Ok(AppEvent::DocumentChanged | AppEvent::BuffersFlushed) => {
        coalesced.refresh_snapshot = true;
        coalesced.rebuild_search_index = true;
      }
      Ok(AppEvent::ExportTask(payload)) => emit_export_task(app, payload),
      Ok(AppEvent::RuntimeStopping) => {
        coalesced.should_stop = true;
        return coalesced;
      }
      Err(broadcast::error::TryRecvError::Empty) => return coalesced,
      Err(broadcast::error::TryRecvError::Lagged(skipped)) => {
        log::warn!("app event worker coalescing lagged by {skipped} events");
        return coalesced;
      }
      Err(broadcast::error::TryRecvError::Closed) => {
        coalesced.should_stop = true;
        return coalesced;
      }
    }
  }
}

fn merge_document_paths(
  current: Option<Vec<PathBuf>>,
  coalesced: Option<Vec<PathBuf>>,
) -> Option<Vec<PathBuf>> {
  match (current, coalesced) {
    (None, _) | (_, None) => None,
    (Some(mut current), Some(coalesced)) => {
      current.extend(coalesced);
      Some(current)
    }
  }
}

fn emit_export_task(app: &tauri::AppHandle, payload: ExportTaskEvent) {
  notify_export_task(app, &payload);

  if let Err(err) = app.emit("export-task", payload) {
    log::warn!("emit export-task failed: {err}");
  }
}

fn notify_export_task(app: &tauri::AppHandle, payload: &ExportTaskEvent) {
  let title = match payload.status.as_str() {
    "finished" => "导出完成",
    "failed" => "导出失败",
    _ => return,
  };
  let body = payload
    .message
    .clone()
    .unwrap_or_else(|| export_output_name(&payload.output_path));

  if let Err(err) = app.notification().builder().title(title).body(body).show() {
    log::warn!("show export notification failed: {err}");
  }
}

fn export_output_name(path: &str) -> String {
  std::path::Path::new(path)
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or(path)
    .to_string()
}

async fn handle_workspace_event(
  app: &tauri::AppHandle,
  refresh_documents: bool,
  document_paths: Option<Vec<PathBuf>>,
  refresh_snapshot: bool,
  rebuild_search_index: bool,
) {
  let (Some(state), Some(services)) = (
    app.try_state::<FsState>(),
    app.try_state::<crate::services::AppServices>(),
  ) else {
    return;
  };

  if refresh_documents {
    let refresh_result = match document_paths {
      Some(paths) if !paths.is_empty() => services
        .documents
        .invalidate_clean_absolute_paths(&state, &paths)
        .map(|_| ()),
      _ => services.documents.clear_clean(),
    };
    if let Err(err) = refresh_result {
      log::warn!("refresh document cache failed: {err}");
    }
    services.workspace.clear_index_cache();
  }

  if rebuild_search_index {
    match app.path().app_data_dir() {
      Ok(index_parent) => {
        if let Err(err) = services
          .workspace
          .rebuild_search_index(index_parent, &state)
          .await
        {
          log::warn!("rebuild search index failed: {err}");
        }
      }
      Err(err) => log::warn!("resolve search index dir failed: {err}"),
    }
  }

  if !refresh_snapshot {
    return;
  }

  match services.workspace.snapshot(&state).await {
    Ok(snapshot) => {
      if let Err(err) = app.emit("fs-changed", snapshot) {
        log::warn!("emit fs-changed failed: {err}");
      }
    }
    Err(err) => log::warn!("workspace snapshot failed: {err}"),
  }
}
