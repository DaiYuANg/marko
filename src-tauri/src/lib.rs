use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
use tauri::{Emitter, Listener, Manager};
use crate::commands::app::{app_get_platform, menu_dispatch};
use crate::commands::fs::{
  fs_create_dir, fs_create_file, fs_delete_path, fs_flush_buffers, fs_get_path_metadata,
  fs_get_root_info, fs_get_snapshot, fs_list_entries, fs_open_file, fs_read_file, fs_rename_path,
  fs_set_root, fs_set_single_file, fs_update_buffer, fs_write_file,
};
use crate::commands::markdown::{list_markdown_files, read_markdown_file, write_markdown_file};

mod commands;
mod models;
mod state;

use crate::state::{FsBufferState, FsState, FsStateData, FsWatcherState, FsWriteQueue};

fn run_impl() {
  tauri::Builder::default()
    .manage(FsState(RwLock::new(FsStateData {
      root_kind: "internal".to_string(),
      root_path: PathBuf::new(),
      internal_root: PathBuf::new(),
      single_file: None,
    })))
    .manage(FsWatcherState(Mutex::new(None)))
    .manage(FsBufferState(Mutex::new(HashMap::new())))
    // new write queue state; worker will be spawned during setup below
    .manage(FsWriteQueue(Mutex::new(None)))
    .setup(|app| {
      let app_handle = app.handle();
      commands::app::setup_native_menu(&app_handle)?;
      let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|_| "Failed to resolve app data dir")?;
      let internal_root = app_data_dir.join("marko").join("workspace");
      fs::create_dir_all(&internal_root)?;
      commands::fs::ensure_default_file(&internal_root)?;

      if let Some(state) = app_handle.try_state::<FsState>() {
        let mut data = state.0.write().map_err(|_| "Failed to lock fs state")?;
        data.root_kind = "internal".to_string();
        data.root_path = internal_root.clone();
        data.internal_root = internal_root;
      }
      if let (Some(state), Some(watcher_state)) = (
        app_handle.try_state::<FsState>(),
        app_handle.try_state::<FsWatcherState>(),
      ) {
        commands::fs::start_fs_watcher(&app_handle, &state, &watcher_state)?;
      }
      commands::fs::start_buffer_flush_worker(&app_handle);

      // -------------------------------------------------------------
      // spawn the background write worker and register its sender
      // -------------------------------------------------------------
      if let Some(write_queue) = app_handle.try_state::<FsWriteQueue>() {
        let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
        *write_queue.0.lock().unwrap() = Some(tx.clone());

        // spawn a single background worker that owns the receiver and
        // handles batching/merging internally.
        let state_clone = app_handle.clone();
        tokio::spawn(async move {
          if let Err(err) = commands::fs::write_worker(&state_clone, rx).await {
            log::warn!("error in write_worker: {}", err);
          }
        });
      }

      if let (Some(splash), Some(main)) = (
        app_handle.get_webview_window("splashscreen"),
        app_handle.get_webview_window("main"),
      ) {
        app_handle.listen("app-ready", move |_| {
          let _ = main.show();
          let _ = main.set_focus();
          let _ = splash.close();
        });
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .on_menu_event(|app, event| {
      let id = event.id().as_ref().to_string();
      let forward = matches!(
        id.as_str(),
        "file.new"
          | "file.open_project"
          | "file.open_file"
          | "view.wysiwyg"
          | "view.source"
          | "view.graph"
          | "view.toggle_sidebar"
          | "view.toggle_right_sidebar"
          | "theme.light"
          | "theme.dark"
          | "theme.marko-light"
          | "theme.marko-dark"
          | "help.about"
      );
      if forward {
        let _ = app.emit("menu-action", id);
      }
    })
    .on_window_event(|window, event| {
      if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
        let app = window.app_handle();
        if let (Some(state), Some(buffer_state)) =
          (app.try_state::<FsState>(), app.try_state::<FsBufferState>())
        {
          let _ = commands::fs::flush_all_buffers(&state, &buffer_state);
        }
      }
    })
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      list_markdown_files,
      read_markdown_file,
      write_markdown_file,
      fs_get_root_info,
      fs_get_snapshot,
      fs_set_root,
      fs_set_single_file,
      fs_list_entries,
      fs_read_file,
      fs_open_file,
      fs_update_buffer,
      fs_flush_buffers,
      fs_get_path_metadata,
      fs_write_file,
      fs_create_file,
      fs_create_dir,
      fs_delete_path,
      fs_rename_path,
      app_get_platform,
      menu_dispatch
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  run_impl();
}

pub async fn run_async() {
  run_impl();
}
