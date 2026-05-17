pub mod di;
pub mod events;
pub mod export;
pub mod fs_buffer;
pub mod git;
pub mod markdown_graph;
pub mod markdown_index;
pub mod path_resolver;
pub mod search;
pub mod workspace;

use fluxdi::Shared;

use events::{EventBus, RuntimeService};
pub use export::ExportService;
use fs_buffer::BufferService;
use git::GitService;
use workspace::WorkspaceService;

#[derive(Debug, Clone)]
pub struct AppServices {
  pub export: Shared<ExportService>,
  pub events: Shared<EventBus>,
  pub fs_buffer: Shared<BufferService>,
  pub git: Shared<GitService>,
  pub runtime: Shared<RuntimeService>,
  pub workspace: Shared<WorkspaceService>,
}
