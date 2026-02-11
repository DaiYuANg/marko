use std::fs;
use std::path::PathBuf;
use std::sync::RwLock;
use tauri::{Listener, Manager};

mod commands;
mod models;
mod state;

use crate::state::{FsState, FsStateData};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(FsState(RwLock::new(FsStateData {
      root_kind: "internal".to_string(),
      root_path: PathBuf::new(),
      internal_root: PathBuf::new(),
    })))
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
      commands::markdown::list_markdown_files,
      commands::markdown::read_markdown_file,
      commands::markdown::write_markdown_file,
      commands::fs::fs_get_root_info,
      commands::fs::fs_set_root,
      commands::fs::fs_list_entries,
      commands::fs::fs_read_file,
      commands::fs::fs_write_file,
      commands::fs::fs_create_file,
      commands::fs::fs_create_dir,
      commands::fs::fs_delete_path,
      commands::fs::fs_rename_path
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
