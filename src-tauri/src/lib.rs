use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
use tauri::{Listener, Manager};
use crate::commands::fs::{fs_create_dir, fs_create_file, fs_delete_path, fs_get_root_info, fs_get_snapshot, fs_list_entries, fs_read_file, fs_rename_path, fs_set_root, fs_write_file};
use crate::commands::markdown::{list_markdown_files, read_markdown_file, write_markdown_file};

mod commands;
mod models;
mod state;

use crate::state::{FsState, FsStateData, FsWatcherState};

fn run_impl() {
  tauri::Builder::default()
    .manage(FsState(RwLock::new(FsStateData {
      root_kind: "internal".to_string(),
      root_path: PathBuf::new(),
      internal_root: PathBuf::new(),
    })))
    .manage(FsWatcherState(Mutex::new(None)))
    .setup(|app| {
      let app_handle = app.handle();
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
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      list_markdown_files,
      read_markdown_file,
      write_markdown_file,
      fs_get_root_info,
      fs_get_snapshot,
      fs_set_root,
      fs_list_entries,
      fs_read_file,
      fs_write_file,
      fs_create_file,
      fs_create_dir,
      fs_delete_path,
      fs_rename_path
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
