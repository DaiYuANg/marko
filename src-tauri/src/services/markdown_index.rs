mod diagnostics;
mod normalize;
mod parser;
mod types;

#[cfg(test)]
mod tests;

use crate::models::{FsEntry, FsMarkdownDiagnostic, FsWorkspaceIndex};

pub(crate) use self::parser::parse_markdown_document;
pub(crate) use self::types::ParsedMarkdownDocument;

#[derive(Debug, Default, Clone, Copy)]
pub struct MarkdownIndexService;

impl MarkdownIndexService {
  pub fn build_workspace_index(
    &self,
    files: &[FsEntry],
    contents: &[(String, String)],
  ) -> FsWorkspaceIndex {
    build_workspace_index(files, contents)
  }

  pub(crate) fn build_workspace_index_from_documents(
    &self,
    files: &[FsEntry],
    documents: &[ParsedMarkdownDocument],
  ) -> FsWorkspaceIndex {
    build_workspace_index_from_documents(files, documents)
  }

  pub fn diagnostics_for_file(
    &self,
    index: &FsWorkspaceIndex,
    active_path: &str,
  ) -> Vec<FsMarkdownDiagnostic> {
    diagnostics::diagnostics_for_file(index, active_path)
  }
}

pub fn build_workspace_index(files: &[FsEntry], contents: &[(String, String)]) -> FsWorkspaceIndex {
  let documents = contents
    .iter()
    .map(|(path, content)| parse_markdown_document(path, content))
    .collect::<Vec<_>>();
  build_workspace_index_from_documents(files, &documents)
}

pub(crate) fn build_workspace_index_from_documents(
  files: &[FsEntry],
  documents: &[ParsedMarkdownDocument],
) -> FsWorkspaceIndex {
  normalize::build_workspace_index_from_documents(files, documents)
}
