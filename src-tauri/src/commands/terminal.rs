use std::path::PathBuf;

use tauri::State;

use crate::services::terminal::TerminalSessionInfo;
use crate::services::AppServices;
use crate::state::FsState;

#[tauri::command]
pub fn terminal_create(
  rows: u16,
  cols: u16,
  state: State<'_, FsState>,
  services: State<'_, AppServices>,
  app: tauri::AppHandle,
) -> Result<TerminalSessionInfo, String> {
  let cwd = terminal_working_directory(&state)?;
  services.terminal.create(app, cwd, rows, cols)
}

#[tauri::command]
pub fn terminal_write(
  id: String,
  data: String,
  services: State<'_, AppServices>,
) -> Result<(), String> {
  services.terminal.write(&id, &data)
}

#[tauri::command]
pub fn terminal_resize(
  id: String,
  rows: u16,
  cols: u16,
  services: State<'_, AppServices>,
) -> Result<(), String> {
  services.terminal.resize(&id, rows, cols)
}

#[tauri::command]
pub fn terminal_close(id: String, services: State<'_, AppServices>) -> Result<(), String> {
  services.terminal.close(&id)
}

fn terminal_working_directory(state: &FsState) -> Result<PathBuf, String> {
  let data = state
    .0
    .read()
    .map_err(|_| "Failed to lock fs state")?
    .clone();

  if data.root_kind == "single" {
    let single_file = data
      .single_file
      .ok_or_else(|| "Single-file path is not set".to_string())?;
    return Ok(
      single_file
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(PathBuf::new),
    );
  }

  Ok(data.root_path)
}
