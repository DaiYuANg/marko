pub mod di;
pub mod export;
pub mod fs_buffer;
pub mod markdown_graph;
pub mod markdown_index;
pub mod path_resolver;
pub mod workspace;

use fluxdi::Shared;

pub use export::ExportService;
use fs_buffer::BufferService;
use workspace::WorkspaceService;

#[derive(Debug, Default, Clone)]
pub struct AppServices {
  pub export: Shared<ExportService>,
  pub fs_buffer: Shared<BufferService>,
  pub workspace: Shared<WorkspaceService>,
}
