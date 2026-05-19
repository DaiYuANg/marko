use std::sync::Mutex;

use fluxdi::{Application, Error, Injector, Module, ModuleLifecycleFuture, Provider, Shared};

use super::{
  document_store::DocumentStoreService,
  events::{EventBus, RuntimeService},
  git::GitService,
  markdown_assets::MarkdownAssetService,
  markdown_graph::MarkdownGraphService,
  markdown_index::MarkdownIndexService,
  path_resolver::PathResolver,
  search::SearchService,
  workspace::WorkspaceService,
  AppServices, ExportService,
};

struct AppModule;

impl Module for AppModule {
  fn configure(&self, injector: &Injector) -> Result<(), Error> {
    injector.try_provide::<ExportService>(Provider::root(|_| Shared::new(ExportService)))?;
    injector.try_provide::<EventBus>(Provider::root(|_| Shared::new(EventBus::default())))?;
    injector.try_provide::<RuntimeService>(Provider::root(|injector| {
      Shared::new(RuntimeService::new(
        injector
          .try_resolve::<EventBus>()
          .expect("EventBus should be registered before RuntimeService"),
      ))
    }))?;
    injector.try_provide::<GitService>(Provider::root(|_| Shared::new(GitService)))?;
    injector.try_provide::<PathResolver>(Provider::root(|_| Shared::new(PathResolver)))?;
    injector.try_provide::<MarkdownAssetService>(Provider::root(|injector| {
      Shared::new(MarkdownAssetService::new(
        *injector
          .try_resolve::<PathResolver>()
          .expect("PathResolver should be registered before MarkdownAssetService"),
      ))
    }))?;
    injector.try_provide::<DocumentStoreService>(Provider::root(|injector| {
      Shared::new(DocumentStoreService::new(
        injector
          .try_resolve::<PathResolver>()
          .expect("PathResolver should be registered before DocumentStoreService"),
      ))
    }))?;
    injector
      .try_provide::<MarkdownIndexService>(Provider::root(|_| Shared::new(MarkdownIndexService)))?;
    injector
      .try_provide::<MarkdownGraphService>(Provider::root(|_| Shared::new(MarkdownGraphService)))?;
    injector.try_provide::<SearchService>(Provider::root(|_| Shared::new(SearchService::new())))?;
    injector.try_provide::<WorkspaceService>(Provider::root(|injector| {
      let path_resolver = injector
        .try_resolve::<PathResolver>()
        .expect("PathResolver should be registered before WorkspaceService");
      let documents = injector
        .try_resolve::<DocumentStoreService>()
        .expect("DocumentStoreService should be registered before WorkspaceService");
      let markdown_index = injector
        .try_resolve::<MarkdownIndexService>()
        .expect("MarkdownIndexService should be registered before WorkspaceService");
      let markdown_graph = injector
        .try_resolve::<MarkdownGraphService>()
        .expect("MarkdownGraphService should be registered before WorkspaceService");
      let search = injector
        .try_resolve::<SearchService>()
        .expect("SearchService should be registered before WorkspaceService");

      Shared::new(WorkspaceService::new(
        path_resolver,
        documents,
        markdown_index,
        markdown_graph,
        search,
      ))
    }))?;

    Ok(())
  }

  fn on_start(&self, injector: Shared<Injector>) -> ModuleLifecycleFuture {
    Box::pin(async move {
      let runtime = injector.try_resolve::<RuntimeService>()?;
      runtime.on_container_start();

      injector.try_resolve::<EventBus>()?;
      injector.try_resolve::<WorkspaceService>()?;
      Ok(())
    })
  }

  fn on_stop(&self, injector: Shared<Injector>) -> ModuleLifecycleFuture {
    Box::pin(async move {
      let runtime = injector.try_resolve::<RuntimeService>()?;
      runtime.on_container_stop();
      Ok(())
    })
  }
}

#[derive(Clone)]
pub struct AppLifecycle {
  application: Shared<Mutex<Option<Application>>>,
}

impl AppLifecycle {
  pub fn shutdown_blocking(&self) -> Result<(), Error> {
    let application = {
      let mut guard = self.application.lock().expect("lock app lifecycle");
      guard.take()
    };

    if let Some(mut application) = application {
      futures::executor::block_on(application.shutdown())?;
    }
    Ok(())
  }
}

pub struct AppContainer {
  pub lifecycle: AppLifecycle,
  pub services: AppServices,
}

pub async fn build_app_container() -> Result<AppContainer, Error> {
  let mut app = Application::new(AppModule);
  app.bootstrap().await?;

  let injector = app.injector();
  let services = AppServices {
    export: injector.try_resolve::<ExportService>()?,
    documents: injector.try_resolve::<DocumentStoreService>()?,
    events: injector.try_resolve::<EventBus>()?,
    git: injector.try_resolve::<GitService>()?,
    markdown_assets: injector.try_resolve::<MarkdownAssetService>()?,
    runtime: injector.try_resolve::<RuntimeService>()?,
    workspace: injector.try_resolve::<WorkspaceService>()?,
  };

  Ok(AppContainer {
    lifecycle: AppLifecycle {
      application: Shared::new(Mutex::new(Some(app))),
    },
    services,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn builds_app_services_from_container() {
    let container = build_app_container()
      .await
      .expect("app services should resolve from fluxdi");
    let services = container.services;
    assert!(services.runtime.is_container_started());

    let state = crate::state::FsState(std::sync::RwLock::new(crate::state::FsStateData {
      root_kind: "internal".to_string(),
      root_path: std::path::PathBuf::new(),
      internal_root: std::path::PathBuf::new(),
      single_file: None,
    }));

    let index = services
      .workspace
      .workspace_index(&state)
      .await
      .expect("workspace index should resolve through WorkspaceService");
    assert!(index.files.is_empty());
  }
}
