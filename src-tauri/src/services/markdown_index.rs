use std::collections::{HashMap, HashSet};
use std::path::{Component, Path};

use path_clean::PathClean;
use percent_encoding::percent_decode_str;
use pulldown_cmark::{Event, HeadingLevel, LinkType, Options, Parser, Tag, TagEnd};

use crate::models::{
  FsEntry, FsIndexedMarkdownFile, FsMarkdownDiagnostic, FsMarkdownHeading, FsMarkdownLink,
  FsWorkspaceIndex,
};

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

  pub fn diagnostics_for_file(
    &self,
    index: &FsWorkspaceIndex,
    active_path: &str,
  ) -> Vec<FsMarkdownDiagnostic> {
    diagnostics_for_file(index, active_path)
  }
}

pub fn build_workspace_index(files: &[FsEntry], contents: &[(String, String)]) -> FsWorkspaceIndex {
  let existing_paths = files
    .iter()
    .filter(|file| file.kind == "file")
    .map(|file| file.path.clone())
    .collect::<HashSet<_>>();
  let name_index = files
    .iter()
    .filter(|file| file.kind == "file")
    .map(|file| {
      (
        create_file_label(&file.path).to_lowercase(),
        file.path.clone(),
      )
    })
    .collect::<HashMap<_, _>>();

  let files = contents
    .iter()
    .map(|(path, content)| {
      let headings = extract_headings(path, content);
      let links = extract_links(content)
        .into_iter()
        .map(|link| normalize_link(path, link, &name_index, &existing_paths))
        .collect();
      FsIndexedMarkdownFile {
        path: path.clone(),
        headings,
        links,
      }
    })
    .collect();

  FsWorkspaceIndex { files }
}

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

#[derive(Debug, Clone)]
struct RawMarkdownLink {
  text: String,
  target: String,
  link_type: String,
  context: String,
  line: usize,
  column: usize,
}

fn extract_headings(path: &str, content: &str) -> Vec<FsMarkdownHeading> {
  let mut headings = Vec::new();
  let mut used_slugs = HashMap::<String, usize>::new();
  let mut current_heading: Option<(u8, usize, String)> = None;
  let parser = Parser::new_ext(content, markdown_options()).into_offset_iter();

  for (event, range) in parser {
    match event {
      Event::Start(Tag::Heading { level, .. }) => {
        current_heading = Some((heading_level_to_u8(level), range.start, String::new()));
      }
      Event::End(TagEnd::Heading(_)) => {
        let Some((level, byte_index, raw_text)) = current_heading.take() else {
          continue;
        };
        let text = raw_text.trim().to_string();
        if text.is_empty() {
          continue;
        }
        let base_slug = {
          let slug = slugify(&text);
          if slug.is_empty() {
            format!("heading-{}", headings.len() + 1)
          } else {
            slug
          }
        };
        let used_count = used_slugs.get(&base_slug).copied().unwrap_or(0);
        used_slugs.insert(base_slug.clone(), used_count + 1);
        headings.push(FsMarkdownHeading {
          path: path.to_string(),
          level,
          text,
          slug: if used_count == 0 {
            base_slug
          } else {
            format!("{base_slug}-{used_count}")
          },
          line: source_location(content, byte_index).0,
        });
      }
      Event::Text(text) | Event::Code(text) => {
        if let Some((_, _, heading_text)) = current_heading.as_mut() {
          heading_text.push_str(&text);
        }
      }
      Event::SoftBreak | Event::HardBreak => {
        if let Some((_, _, heading_text)) = current_heading.as_mut() {
          heading_text.push(' ');
        }
      }
      _ => {}
    }
  }

  headings
}

fn extract_links(content: &str) -> Vec<RawMarkdownLink> {
  let mut links = Vec::new();
  let mut current_link: Option<(String, String, usize, String)> = None;
  let parser = Parser::new_ext(content, markdown_options()).into_offset_iter();

  for (event, range) in parser {
    match event {
      Event::Start(Tag::Link {
        link_type,
        dest_url,
        ..
      }) => {
        current_link = Some((
          markdown_link_type(link_type).to_string(),
          dest_url.to_string(),
          range.start,
          String::new(),
        ));
      }
      Event::End(TagEnd::Link) => {
        let Some((link_type, target, byte_index, raw_text)) = current_link.take() else {
          continue;
        };
        let target = target.trim().to_string();
        if target.is_empty() {
          continue;
        }
        let text = raw_text.trim();
        let (line, column) = source_location(content, byte_index);
        links.push(RawMarkdownLink {
          text: if text.is_empty() {
            target.clone()
          } else {
            text.to_string()
          },
          target,
          link_type,
          context: line_context(content, byte_index),
          line,
          column,
        });
      }
      Event::Text(text) | Event::Code(text) => {
        if let Some((_, _, _, link_text)) = current_link.as_mut() {
          link_text.push_str(&text);
        }
      }
      Event::SoftBreak | Event::HardBreak => {
        if let Some((_, _, _, link_text)) = current_link.as_mut() {
          link_text.push(' ');
        }
      }
      _ => {}
    }
  }

  links
}

fn markdown_options() -> Options {
  Options::ENABLE_GFM | Options::ENABLE_WIKILINKS
}

fn heading_level_to_u8(level: HeadingLevel) -> u8 {
  match level {
    HeadingLevel::H1 => 1,
    HeadingLevel::H2 => 2,
    HeadingLevel::H3 => 3,
    HeadingLevel::H4 => 4,
    HeadingLevel::H5 => 5,
    HeadingLevel::H6 => 6,
  }
}

fn markdown_link_type(link_type: LinkType) -> &'static str {
  match link_type {
    LinkType::WikiLink { .. } => "wiki",
    _ => "markdown",
  }
}

fn normalize_link(
  source_path: &str,
  link: RawMarkdownLink,
  name_index: &HashMap<String, String>,
  existing_paths: &HashSet<String>,
) -> FsMarkdownLink {
  if is_external_target(&link.target) {
    return FsMarkdownLink {
      source_path: source_path.to_string(),
      text: link.text,
      target: link.target,
      link_type: link.link_type,
      target_path: None,
      target_anchor: None,
      target_heading_slug: None,
      is_external: true,
      context: link.context,
      line: link.line,
      column: link.column,
    };
  }

  let (target_path_part, target_anchor) = split_link_target(&link.target);
  let target_path = if link.link_type == "wiki" {
    name_index
      .get(&target_path_part.to_lowercase())
      .cloned()
      .unwrap_or_else(|| format!("{target_path_part}.md"))
  } else if target_path_part.trim().is_empty() {
    source_path.to_string()
  } else {
    let resolved = resolve_relative_link_path(source_path, &target_path_part);
    resolve_markdown_target_path(&resolved, existing_paths)
  };
  let target_heading_slug = target_anchor
    .as_deref()
    .map(normalize_heading_anchor)
    .filter(|slug| !slug.is_empty());

  FsMarkdownLink {
    source_path: source_path.to_string(),
    text: link.text,
    target: link.target,
    link_type: link.link_type,
    target_path: Some(target_path),
    target_anchor,
    target_heading_slug,
    is_external: false,
    context: link.context,
    line: link.line,
    column: link.column,
  }
}

fn split_link_target(target: &str) -> (String, Option<String>) {
  match target.find('#') {
    Some(index) => (
      target[..index].to_string(),
      Some(target[index + 1..].to_string()),
    ),
    None => (target.to_string(), None),
  }
}

fn resolve_relative_link_path(base: &str, target: &str) -> String {
  let path_part = target.split('#').next().unwrap_or_default();
  if let Some(stripped) = path_part.strip_prefix('/') {
    return normalize_workspace_path(stripped);
  }
  let base_dir = base
    .rsplit_once('/')
    .map(|(dir, _)| dir)
    .unwrap_or_default();
  let joined = if base_dir.is_empty() {
    path_part.to_string()
  } else {
    format!("{base_dir}/{path_part}")
  };
  normalize_workspace_path(&joined)
}

fn resolve_markdown_target_path(target: &str, existing_paths: &HashSet<String>) -> String {
  let normalized = normalize_workspace_path(target);
  if has_markdown_extension(&normalized) {
    return normalized;
  }

  let md = format!("{normalized}.md");
  if existing_paths.contains(&md) {
    return md;
  }
  let markdown = format!("{normalized}.markdown");
  if existing_paths.contains(&markdown) {
    return markdown;
  }
  md
}

fn normalize_workspace_path(value: &str) -> String {
  let normalized = value.replace('\\', "/");
  let cleaned = Path::new(&normalized).clean();
  let mut safe = Vec::<String>::new();
  for component in cleaned.components() {
    match component {
      Component::Normal(value) => safe.push(value.to_string_lossy().to_string()),
      Component::ParentDir => {
        safe.pop();
      }
      Component::CurDir | Component::RootDir | Component::Prefix(_) => {}
    }
  }
  safe.join("/")
}

fn normalize_heading_anchor(anchor: &str) -> String {
  slugify(&percent_decode(anchor.trim()))
}

fn percent_decode(value: &str) -> String {
  percent_decode_str(value).decode_utf8_lossy().to_string()
}

fn slugify(label: &str) -> String {
  let mut slug = String::new();
  let mut previous_dash = false;
  for char in label.trim().chars().flat_map(|char| char.to_lowercase()) {
    if char.is_whitespace() {
      if !previous_dash && !slug.is_empty() {
        slug.push('-');
        previous_dash = true;
      }
      continue;
    }
    if char.is_alphanumeric() || char == '-' {
      slug.push(char);
      previous_dash = char == '-';
    }
  }
  slug.trim_matches('-').to_string()
}

fn create_file_label(relative_path: &str) -> String {
  let base = relative_path.rsplit('/').next().unwrap_or(relative_path);
  base
    .strip_suffix(".markdown")
    .or_else(|| base.strip_suffix(".md"))
    .unwrap_or(base)
    .to_string()
}

fn is_external_target(target: &str) -> bool {
  let lower = target.to_lowercase();
  lower.starts_with("http://")
    || lower.starts_with("https://")
    || lower.starts_with("mailto:")
    || lower.starts_with("tel:")
}

fn has_markdown_extension(path: &str) -> bool {
  let lower = path.to_lowercase();
  lower.ends_with(".md") || lower.ends_with(".markdown")
}

fn source_location(content: &str, byte_index: usize) -> (usize, usize) {
  let before = &content[..byte_index.min(content.len())];
  let line = before.chars().filter(|char| *char == '\n').count() + 1;
  let line_start = before.rfind('\n').map(|index| index + 1).unwrap_or(0);
  let column = content[line_start..byte_index.min(content.len())]
    .chars()
    .count()
    + 1;
  (line, column)
}

fn line_context(content: &str, byte_index: usize) -> String {
  let safe_index = byte_index.min(content.len());
  let line_start = content[..safe_index]
    .rfind('\n')
    .map(|index| index + 1)
    .unwrap_or(0);
  let line_end = content[safe_index..]
    .find('\n')
    .map(|index| safe_index + index)
    .unwrap_or(content.len());
  content[line_start..line_end]
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn indexes_headings_and_normalized_links() {
    let files = vec![
      FsEntry {
        path: "notes/current.md".to_string(),
        name: "current.md".to_string(),
        kind: "file".to_string(),
      },
      FsEntry {
        path: "notes/target.md".to_string(),
        name: "target.md".to_string(),
        kind: "file".to_string(),
      },
      FsEntry {
        path: "daily/today.md".to_string(),
        name: "today.md".to_string(),
        kind: "file".to_string(),
      },
    ];
    let contents = vec![
      (
        "notes/current.md".to_string(),
        "# Current\nSee [Target](target.md#Details) and [[today]].\n".to_string(),
      ),
      (
        "notes/target.md".to_string(),
        "# Target\n## Details\n## API & UI\n".to_string(),
      ),
      ("daily/today.md".to_string(), "# Today\n".to_string()),
    ];

    let index = build_workspace_index(&files, &contents);
    let current = index
      .files
      .iter()
      .find(|file| file.path == "notes/current.md")
      .expect("current file should be indexed");
    let target = index
      .files
      .iter()
      .find(|file| file.path == "notes/target.md")
      .expect("target file should be indexed");

    assert_eq!(target.headings[2].slug, "api-ui");
    assert_eq!(
      current.links[0].target_path.as_deref(),
      Some("notes/target.md")
    );
    assert_eq!(
      current.links[0].target_heading_slug.as_deref(),
      Some("details")
    );
    assert_eq!(
      current.links[1].target_path.as_deref(),
      Some("daily/today.md")
    );
    assert_eq!(current.links[1].link_type, "wiki");
    assert_eq!(current.links[1].line, 2);
  }
}
