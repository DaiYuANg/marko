pub mod di;
pub mod export;
pub mod fs_buffer;
pub mod markdown_index;
pub mod path_resolver;

use fluxdi::Shared;

pub use export::ExportService;
use fs_buffer::BufferService;
use markdown_index::MarkdownIndexService;
use path_resolver::PathResolver;

#[derive(Debug, Default, Clone)]
pub struct AppServices {
  pub export: Shared<ExportService>,
  pub fs_buffer: Shared<BufferService>,
  pub markdown_index: Shared<MarkdownIndexService>,
  pub path_resolver: Shared<PathResolver>,
}
