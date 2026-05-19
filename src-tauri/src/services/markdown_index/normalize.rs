use std::collections::{HashMap, HashSet};
use std::path::{Component, Path};

use camino::Utf8Path;
use mime_guess::from_path;
use path_clean::PathClean;
use percent_encoding::percent_decode_str;
use url::Url;

use crate::models::{
  FsEntry, FsIndexedMarkdownFile, FsMarkdownAsset, FsMarkdownLink, FsWorkspaceIndex,
};

use super::parser::slugify;
use super::types::{ParsedMarkdownDocument, RawMarkdownAsset, RawMarkdownLink};

pub(crate) fn build_workspace_index_from_documents(
  files: &[FsEntry],
  documents: &[ParsedMarkdownDocument],
) -> FsWorkspaceIndex {
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

  let files = documents
    .iter()
    .map(|document| {
      let links = document
        .links
        .clone()
        .into_iter()
        .map(|link| normalize_link(&document.path, link, &name_index, &existing_paths))
        .collect();
      let assets = document
        .assets
        .clone()
        .into_iter()
        .map(|asset| normalize_asset(&document.path, asset))
        .collect();
      FsIndexedMarkdownFile {
        path: document.path.clone(),
        headings: document.headings.clone(),
        links,
        assets,
      }
    })
    .collect();

  FsWorkspaceIndex { files }
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

fn normalize_asset(source_path: &str, asset: RawMarkdownAsset) -> FsMarkdownAsset {
  if is_external_target(&asset.target) {
    return FsMarkdownAsset {
      source_path: source_path.to_string(),
      target: asset.target,
      target_path: None,
      is_external: true,
      media_type: None,
      context: asset.context,
      line: asset.line,
      column: asset.column,
    };
  }

  let (target_path_part, _) = split_link_target(&asset.target);
  let target_path = if target_path_part.trim().is_empty() {
    None
  } else {
    Some(resolve_relative_link_path(source_path, &target_path_part))
  };

  FsMarkdownAsset {
    source_path: source_path.to_string(),
    media_type: target_path.as_deref().and_then(guess_media_type),
    target: asset.target,
    target_path,
    is_external: false,
    context: if asset.text.is_empty() {
      asset.context
    } else {
      format!("{} {}", asset.text, asset.context)
        .trim()
        .to_string()
    },
    line: asset.line,
    column: asset.column,
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

fn guess_media_type(path: &str) -> Option<String> {
  from_path(media_lookup_target(path))
    .first_raw()
    .map(ToOwned::to_owned)
}

fn media_lookup_target(target: &str) -> &str {
  target
    .split_once('#')
    .map(|(path, _)| path)
    .unwrap_or(target)
    .split_once('?')
    .map(|(path, _)| path)
    .unwrap_or(target)
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

fn create_file_label(relative_path: &str) -> String {
  let base = Utf8Path::new(relative_path)
    .file_name()
    .unwrap_or(relative_path);
  base
    .strip_suffix(".markdown")
    .or_else(|| base.strip_suffix(".md"))
    .unwrap_or(base)
    .to_string()
}

fn is_external_target(target: &str) -> bool {
  Url::parse(target)
    .map(|url| matches!(url.scheme(), "http" | "https" | "mailto" | "tel"))
    .unwrap_or(false)
}

fn has_markdown_extension(path: &str) -> bool {
  let lower = path.to_lowercase();
  lower.ends_with(".md") || lower.ends_with(".markdown")
}
