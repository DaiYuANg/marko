use crate::models::FsMarkdownHeading;

#[derive(Debug, Clone)]
pub(crate) struct ParsedMarkdownDocument {
  pub path: String,
  pub headings: Vec<FsMarkdownHeading>,
  pub(super) links: Vec<RawMarkdownLink>,
  pub(super) assets: Vec<RawMarkdownAsset>,
}

#[derive(Debug, Clone)]
pub(super) struct RawMarkdownLink {
  pub(super) text: String,
  pub(super) target: String,
  pub(super) link_type: String,
  pub(super) context: String,
  pub(super) line: usize,
  pub(super) column: usize,
}

#[derive(Debug, Clone)]
pub(super) struct RawMarkdownAsset {
  pub(super) target: String,
  pub(super) text: String,
  pub(super) context: String,
  pub(super) line: usize,
  pub(super) column: usize,
}
