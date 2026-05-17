use fluxdi::{Application, Error, Injector, Module, Provider, Shared};

use super::{
  fs_buffer::BufferService, markdown_index::MarkdownIndexService, path_resolver::PathResolver,
  AppServices, ExportService,
};

struct AppModule;

impl Module for AppModule {
  fn configure(&self, injector: &Injector) -> Result<(), Error> {
    injector.try_provide::<ExportService>(Provider::root(|_| Shared::new(ExportService)))?;
    injector.try_provide::<BufferService>(Provider::root(|_| Shared::new(BufferService)))?;
    injector
      .try_provide::<MarkdownIndexService>(Provider::root(|_| Shared::new(MarkdownIndexService)))?;
    injector.try_provide::<PathResolver>(Provider::root(|_| Shared::new(PathResolver)))?;

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
    markdown_index: injector.try_resolve::<MarkdownIndexService>()?,
    path_resolver: injector.try_resolve::<PathResolver>()?,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn builds_app_services_from_container() {
    let services = build_app_services().expect("app services should resolve from fluxdi");

    let index = services.markdown_index.build_workspace_index(&[], &[]);
    assert!(index.files.is_empty());
  }
}
