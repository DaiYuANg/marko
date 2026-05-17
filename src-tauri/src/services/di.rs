use fluxdi::{Application, Error, Injector, Module, Provider, Shared};

use super::{
  fs_buffer::BufferService, markdown_graph::MarkdownGraphService,
  markdown_index::MarkdownIndexService, path_resolver::PathResolver, workspace::WorkspaceService,
  AppServices, ExportService,
};

struct AppModule;

impl Module for AppModule {
  fn configure(&self, injector: &Injector) -> Result<(), Error> {
    injector.try_provide::<ExportService>(Provider::root(|_| Shared::new(ExportService)))?;
    injector.try_provide::<PathResolver>(Provider::root(|_| Shared::new(PathResolver)))?;
    injector.try_provide::<BufferService>(Provider::root(|injector| {
      Shared::new(BufferService::new(
        injector
          .try_resolve::<PathResolver>()
          .expect("PathResolver should be registered before BufferService"),
      ))
    }))?;
    injector
      .try_provide::<MarkdownIndexService>(Provider::root(|_| Shared::new(MarkdownIndexService)))?;
    injector
      .try_provide::<MarkdownGraphService>(Provider::root(|_| Shared::new(MarkdownGraphService)))?;
    injector.try_provide::<WorkspaceService>(Provider::root(|injector| {
      let path_resolver = injector
        .try_resolve::<PathResolver>()
        .expect("PathResolver should be registered before WorkspaceService");
      let buffer = injector
        .try_resolve::<BufferService>()
        .expect("BufferService should be registered before WorkspaceService");
      let markdown_index = injector
        .try_resolve::<MarkdownIndexService>()
        .expect("MarkdownIndexService should be registered before WorkspaceService");
      let markdown_graph = injector
        .try_resolve::<MarkdownGraphService>()
        .expect("MarkdownGraphService should be registered before WorkspaceService");

      Shared::new(WorkspaceService::new(
        path_resolver,
        buffer,
        markdown_index,
        markdown_graph,
      ))
    }))?;

    Ok(())
  }
}

pub fn build_app_services() -> Result<AppServices, Error> {
  let mut app = Application::new(AppModule);
  app.bootstrap_sync()?;

  let injector = app.injector();
  Ok(AppServices {
    export: injector.try_resolve::<ExportService>()?,
    fs_buffer: injector.try_resolve::<BufferService>()?,
    workspace: injector.try_resolve::<WorkspaceService>()?,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn builds_app_services_from_container() {
    let services = build_app_services().expect("app services should resolve from fluxdi");

    let state = crate::state::FsState(std::sync::RwLock::new(crate::state::FsStateData {
      root_kind: "internal".to_string(),
      root_path: std::path::PathBuf::new(),
      internal_root: std::path::PathBuf::new(),
      single_file: None,
    }));

    let index = services
      .workspace
      .workspace_index(
        &state,
        &crate::state::FsBufferState(std::sync::Mutex::new(std::collections::HashMap::new())),
      )
      .await
      .expect("workspace index should resolve through WorkspaceService");
    assert!(index.files.is_empty());
  }
}
