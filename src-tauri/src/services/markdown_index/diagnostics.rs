use std::collections::HashMap;

use crate::models::{FsMarkdownDiagnostic, FsMarkdownLink, FsWorkspaceIndex};

pub fn diagnostics_for_file(
  index: &FsWorkspaceIndex,
  active_path: &str,
) -> Vec<FsMarkdownDiagnostic> {
  let files_by_path = index
    .files
    .iter()
    .map(|file| (file.path.as_str(), file))
    .collect::<HashMap<_, _>>();
  let Some(active_file) = files_by_path.get(active_path) else {
    return Vec::new();
  };

  active_file
    .links
    .iter()
    .filter(|link| !link.is_external)
    .filter_map(|link| {
      let target_path = link.target_path.as_deref()?;
      let target = files_by_path.get(target_path);
      if target.is_none() {
        return Some(markdown_diagnostic(
          link,
          format!("Cannot find linked file \"{}\"", link.target),
          "error",
        ));
      }

      let slug = link.target_heading_slug.as_deref()?;
      let target_file = target?;
      if target_file
        .headings
        .iter()
        .any(|heading| heading.slug == slug)
      {
        return None;
      }
      Some(markdown_diagnostic(
        link,
        format!(
          "Cannot find heading \"{}\" in {}",
          link.target_anchor.as_deref().unwrap_or(slug),
          target_path
        ),
        "warning",
      ))
    })
    .collect()
}

fn markdown_diagnostic(
  link: &FsMarkdownLink,
  message: String,
  severity: &str,
) -> FsMarkdownDiagnostic {
  let width = link.target.chars().count().max(1);
  FsMarkdownDiagnostic {
    line: link.line,
    start_column: link.column,
    end_column: link.column + width,
    message,
    severity: severity.to_string(),
  }
}
