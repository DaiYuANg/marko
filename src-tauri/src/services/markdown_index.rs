use std::collections::{HashMap, HashSet};

use crate::models::{
  FsEntry, FsIndexedMarkdownFile, FsMarkdownHeading, FsMarkdownLink, FsWorkspaceIndex,
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

  for (line_index, line) in content.lines().enumerate() {
    let level = line.chars().take_while(|char| *char == '#').count();
    if !(1..=6).contains(&level) {
      continue;
    }
    if !line[level..]
      .chars()
      .next()
      .is_some_and(char::is_whitespace)
    {
      continue;
    }

    let text = line[level..].trim().to_string();
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
      level: level as u8,
      text,
      slug: if used_count == 0 {
        base_slug
      } else {
        format!("{base_slug}-{used_count}")
      },
      line: line_index + 1,
    });
  }

  headings
}

fn extract_links(content: &str) -> Vec<RawMarkdownLink> {
  let mut links = Vec::new();
  links.extend(extract_markdown_links(content));
  links.extend(extract_wiki_links(content));
  links
    .into_iter()
    .filter(|link| !link.target.trim().is_empty())
    .collect()
}

fn extract_markdown_links(content: &str) -> Vec<RawMarkdownLink> {
  let mut links = Vec::new();
  let mut search_start = 0usize;

  while let Some(open_rel) = content[search_start..].find('[') {
    let open = search_start + open_rel;
    if content[open..].starts_with("[[") {
      search_start = open + 2;
      continue;
    }

    let Some(close_rel) = content[open + 1..].find(']') else {
      break;
    };
    let close = open + 1 + close_rel;
    if !content
      .get(close + 1..)
      .unwrap_or_default()
      .starts_with('(')
    {
      search_start = open + 1;
      continue;
    }

    let target_start = close + 2;
    let Some(target_end_rel) = content[target_start..].find(')') else {
      break;
    };
    let target_end = target_start + target_end_rel;
    let text = content[open + 1..close].trim();
    let target = content[target_start..target_end].trim();
    if !text.is_empty() && !target.is_empty() {
      let (line, column) = source_location(content, open);
      links.push(RawMarkdownLink {
        text: text.to_string(),
        target: target.to_string(),
        link_type: "markdown".to_string(),
        context: line_context(content, open),
        line,
        column,
      });
    }
    search_start = target_end + 1;
  }

  links
}

fn extract_wiki_links(content: &str) -> Vec<RawMarkdownLink> {
  let mut links = Vec::new();
  let mut search_start = 0usize;

  while let Some(open_rel) = content[search_start..].find("[[") {
    let open = search_start + open_rel;
    let target_start = open + 2;
    let Some(close_rel) = content[target_start..].find("]]") else {
      break;
    };
    let close = target_start + close_rel;
    let target = content[target_start..close].trim();
    if !target.is_empty() {
      let (line, column) = source_location(content, open);
      links.push(RawMarkdownLink {
        text: target.to_string(),
        target: target.to_string(),
        link_type: "wiki".to_string(),
        context: line_context(content, open),
        line,
        column,
      });
    }
    search_start = close + 2;
  }

  links
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
  let mut stack = Vec::<&str>::new();
  for part in normalized.split('/') {
    if part.is_empty() || part == "." {
      continue;
    }
    if part == ".." {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  stack.join("/")
}

fn normalize_heading_anchor(anchor: &str) -> String {
  slugify(&percent_decode(anchor.trim()))
}

fn percent_decode(value: &str) -> String {
  let bytes = value.as_bytes();
  let mut output = Vec::with_capacity(bytes.len());
  let mut index = 0usize;
  while index < bytes.len() {
    if bytes[index] == b'%' && index + 2 < bytes.len() {
      if let Ok(hex) = u8::from_str_radix(&value[index + 1..index + 3], 16) {
        output.push(hex);
        index += 3;
        continue;
      }
    }
    output.push(bytes[index]);
    index += 1;
  }
  String::from_utf8_lossy(&output).to_string()
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
