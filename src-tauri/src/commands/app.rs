use tauri::{AppHandle, Emitter};

#[tauri::command]
pub fn app_get_platform() -> String {
  std::env::consts::OS.to_string()
}

#[tauri::command]
pub fn menu_dispatch(id: String, app: AppHandle) -> Result<(), String> {
  app.emit("menu-action", id).map_err(|err| err.to_string())
}

#[cfg(target_os = "macos")]
pub fn setup_native_menu(app: &AppHandle) -> Result<(), String> {
  use tauri::menu::{MenuBuilder, SubmenuBuilder};

  let file = SubmenuBuilder::new(app, "File")
    .text("file.open_project", "Open Folder…")
    .text("file.open_file", "Open File…")
    .separator()
    .text("file.new", "New File")
    .separator()
    .text("file.export_pdf", "Export to PDF…")
    .text("file.export_docx", "Export to Word…")
    .text("file.export_html", "Export to HTML…")
    .build()
    .map_err(|err| err.to_string())?;

  let edit = SubmenuBuilder::new(app, "Edit")
    .undo()
    .redo()
    .separator()
    .cut()
    .copy()
    .paste()
    .separator()
    .select_all()
    .build()
    .map_err(|err| err.to_string())?;

  let view = SubmenuBuilder::new(app, "View")
    .text("view.wysiwyg", "WYSIWYG")
    .text("view.source", "Source")
    .text("view.graph", "Graph")
    .separator()
    .text("view.toggle_sidebar", "Toggle Sidebar")
    .text("view.toggle_right_sidebar", "Toggle Right Sidebar")
    .build()
    .map_err(|err| err.to_string())?;

  let theme = SubmenuBuilder::new(app, "Theme")
    .text("theme.light", "Light")
    .text("theme.dark", "Dark")
    .separator()
    .text("theme.marko-light", "Marko Light")
    .text("theme.marko-dark", "Marko Dark")
    .build()
    .map_err(|err| err.to_string())?;

  let help = SubmenuBuilder::new(app, "Help")
    .text("help.about", "About marko")
    .build()
    .map_err(|err| err.to_string())?;

  let menu = MenuBuilder::new(app)
    .items(&[&file, &edit, &view, &theme, &help])
    .build()
    .map_err(|err| err.to_string())?;

  app.set_menu(menu).map_err(|err| err.to_string())?;
  Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn setup_native_menu(_app: &AppHandle) -> Result<(), String> {
  Ok(())
}
