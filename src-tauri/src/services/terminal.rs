use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
pub struct TerminalSessionInfo {
  pub id: String,
  pub shell: String,
  pub cwd: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalOutputEvent {
  pub id: String,
  pub data: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalExitEvent {
  pub id: String,
  pub exit_code: Option<u32>,
  pub signal: Option<String>,
}

pub struct TerminalService {
  sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
  next_id: AtomicU64,
}

struct TerminalSession {
  master: Box<dyn MasterPty + Send>,
  writer: Arc<Mutex<Box<dyn Write + Send>>>,
  killer: Arc<Mutex<Box<dyn ChildKiller + Send + Sync>>>,
}

impl std::fmt::Debug for TerminalService {
  fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    formatter
      .debug_struct("TerminalService")
      .field("sessions", &self.session_count())
      .finish()
  }
}

impl TerminalService {
  pub fn new() -> Self {
    Self {
      sessions: Arc::new(Mutex::new(HashMap::new())),
      next_id: AtomicU64::new(1),
    }
  }

  pub fn create(
    &self,
    app: AppHandle,
    cwd: PathBuf,
    rows: u16,
    cols: u16,
  ) -> Result<TerminalSessionInfo, String> {
    let id = format!("terminal-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
    let shell = default_shell();
    let cwd = normalize_cwd(cwd)?;
    let size = normalized_size(rows, cols);
    let pty_system = native_pty_system();
    let pair = pty_system
      .openpty(size)
      .map_err(|err| format!("Failed to create terminal pty: {err}"))?;
    let mut command = CommandBuilder::new(&shell);
    command.cwd(cwd.as_os_str());
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");

    let child = pair
      .slave
      .spawn_command(command)
      .map_err(|err| format!("Failed to spawn terminal shell: {err}"))?;
    let killer = Arc::new(Mutex::new(child.clone_killer()));
    let reader = pair
      .master
      .try_clone_reader()
      .map_err(|err| format!("Failed to read terminal output: {err}"))?;
    let writer = Arc::new(Mutex::new(
      pair
        .master
        .take_writer()
        .map_err(|err| format!("Failed to open terminal input: {err}"))?,
    ));

    let session = TerminalSession {
      master: pair.master,
      writer,
      killer,
    };
    self
      .sessions
      .lock()
      .map_err(|_| "Failed to lock terminal sessions")?
      .insert(id.clone(), session);

    spawn_reader_thread(app.clone(), id.clone(), reader);
    spawn_wait_thread(app, id.clone(), Arc::clone(&self.sessions), child);

    Ok(TerminalSessionInfo {
      id,
      shell,
      cwd: cwd.to_string_lossy().to_string(),
    })
  }

  pub fn write(&self, id: &str, data: &str) -> Result<(), String> {
    let writer = {
      let sessions = self
        .sessions
        .lock()
        .map_err(|_| "Failed to lock terminal sessions")?;
      Arc::clone(
        &sessions
          .get(id)
          .ok_or_else(|| format!("Terminal session not found: {id}"))?
          .writer,
      )
    };
    let mut writer = writer.lock().map_err(|_| "Failed to lock terminal input")?;
    writer
      .write_all(data.as_bytes())
      .map_err(|err| format!("Failed to write terminal input: {err}"))?;
    writer
      .flush()
      .map_err(|err| format!("Failed to flush terminal input: {err}"))
  }

  pub fn resize(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
    let sessions = self
      .sessions
      .lock()
      .map_err(|_| "Failed to lock terminal sessions")?;
    let session = sessions
      .get(id)
      .ok_or_else(|| format!("Terminal session not found: {id}"))?;
    session
      .master
      .resize(normalized_size(rows, cols))
      .map_err(|err| format!("Failed to resize terminal: {err}"))
  }

  pub fn close(&self, id: &str) -> Result<(), String> {
    let session = self
      .sessions
      .lock()
      .map_err(|_| "Failed to lock terminal sessions")?
      .remove(id);
    if let Some(session) = session {
      let mut killer = session
        .killer
        .lock()
        .map_err(|_| "Failed to lock terminal process")?;
      let _ = killer.kill();
    }
    Ok(())
  }

  pub fn session_count(&self) -> usize {
    self
      .sessions
      .lock()
      .map(|sessions| sessions.len())
      .unwrap_or_default()
  }
}

impl Default for TerminalService {
  fn default() -> Self {
    Self::new()
  }
}

impl Drop for TerminalService {
  fn drop(&mut self) {
    let session_ids = self
      .sessions
      .lock()
      .map(|sessions| sessions.keys().cloned().collect::<Vec<_>>())
      .unwrap_or_default();
    for id in session_ids {
      let _ = self.close(&id);
    }
  }
}

fn spawn_reader_thread(app: AppHandle, id: String, mut reader: Box<dyn Read + Send>) {
  thread::spawn(move || {
    let mut buffer = [0_u8; 8192];
    loop {
      match reader.read(&mut buffer) {
        Ok(0) => break,
        Ok(bytes_read) => {
          let data = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
          let _ = app.emit(
            "terminal-output",
            TerminalOutputEvent {
              id: id.clone(),
              data,
            },
          );
        }
        Err(_) => break,
      }
    }
  });
}

fn spawn_wait_thread(
  app: AppHandle,
  id: String,
  sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
  mut child: Box<dyn portable_pty::Child + Send + Sync>,
) {
  thread::spawn(move || {
    let status = child.wait().ok();
    if let Ok(mut sessions) = sessions.lock() {
      sessions.remove(&id);
    }
    let _ = app.emit(
      "terminal-exit",
      TerminalExitEvent {
        id,
        exit_code: status.as_ref().map(|status| status.exit_code()),
        signal: status.and_then(|status| status.signal().map(ToString::to_string)),
      },
    );
  });
}

fn normalized_size(rows: u16, cols: u16) -> PtySize {
  PtySize {
    rows: rows.clamp(8, 200),
    cols: cols.clamp(20, 400),
    pixel_width: 0,
    pixel_height: 0,
  }
}

fn normalize_cwd(cwd: PathBuf) -> Result<PathBuf, String> {
  let cwd = if cwd.as_os_str().is_empty() {
    std::env::current_dir().map_err(|err| format!("Failed to resolve current directory: {err}"))?
  } else {
    cwd
  };
  if !cwd.exists() {
    return Err(format!(
      "Terminal working directory does not exist: {}",
      cwd.display()
    ));
  }
  if !cwd.is_dir() {
    return Err(format!(
      "Terminal working directory must be a directory: {}",
      cwd.display()
    ));
  }
  Ok(cwd)
}

fn default_shell() -> String {
  #[cfg(windows)]
  {
    std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
  }

  #[cfg(not(windows))]
  {
    std::env::var("SHELL").unwrap_or_else(|_| {
      if cfg!(target_os = "macos") {
        "/bin/zsh".to_string()
      } else {
        "/bin/sh".to_string()
      }
    })
  }
}
