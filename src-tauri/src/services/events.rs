use std::{
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
  },
  time::Duration,
};

use fluxdi::Shared;
use tauri::{Emitter, Manager};
use tokio::sync::broadcast;

use crate::state::{FsBufferState, FsState};

#[derive(Debug, Clone, Copy)]
pub enum AppEvent {
  WorkspaceChanged,
  FileSystemChanged,
  BuffersFlushed,
  RuntimeStopping,
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
          AppEvent::FileSystemChanged
        }
        Err(broadcast::error::RecvError::Closed) => break,
      };
      if matches!(event, AppEvent::RuntimeStopping) {
        break;
      }
      coalesce_related_events(&mut receiver, event).await;
      handle_workspace_event(&app_handle).await;
    }
    event_worker_started.store(false, Ordering::SeqCst);
  });
}

async fn coalesce_related_events(receiver: &mut broadcast::Receiver<AppEvent>, first: AppEvent) {
  if !matches!(
    first,
    AppEvent::WorkspaceChanged | AppEvent::FileSystemChanged | AppEvent::BuffersFlushed
  ) {
    return;
  }

  tokio::time::sleep(Duration::from_millis(80)).await;
  while receiver.try_recv().is_ok() {}
}

async fn handle_workspace_event(app: &tauri::AppHandle) {
  let (Some(state), Some(buffer_state), Some(services)) = (
    app.try_state::<FsState>(),
    app.try_state::<FsBufferState>(),
    app.try_state::<crate::services::AppServices>(),
  ) else {
    return;
  };

  match app.path().app_data_dir() {
    Ok(index_parent) => {
      if let Err(err) = services
        .workspace
        .rebuild_search_index(index_parent, &state, &buffer_state)
        .await
      {
        log::warn!("rebuild search index failed: {err}");
      }
    }
    Err(err) => log::warn!("resolve search index dir failed: {err}"),
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
