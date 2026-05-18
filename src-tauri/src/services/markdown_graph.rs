use std::collections::{HashMap, HashSet};

use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag, TagEnd};

use crate::models::{FsGraph, FsGraphEdge, FsGraphNode, FsMarkdownBlock, FsWorkspaceIndex};

#[derive(Debug, Default, Clone, Copy)]
pub struct MarkdownGraphService;

impl MarkdownGraphService {
  pub fn build_outline_graph(&self, path: &str, markdown: &str) -> FsGraph {
    build_outline_graph(path, markdown)
  }

  pub fn build_workspace_graph(&self, index: &FsWorkspaceIndex) -> FsGraph {
    build_workspace_graph(index)
  }
}

#[derive(Debug)]
struct HeadingDraft {
  level: u8,
  text: String,
  line: usize,
  start_offset: usize,
}

pub fn build_outline_graph(path: &str, markdown: &str) -> FsGraph {
  let mut nodes = vec![FsGraphNode {
    id: file_node_id(path),
    kind: "file".to_string(),
    label: create_file_label(path),
    path: Some(path.to_string()),
    line: None,
    level: None,
    slug: None,
    content: None,
    content_blocks: None,
    content_start_line: None,
    content_end_line: None,
  }];
  let mut edges = Vec::new();
  let mut headings = Vec::new();
  let mut heading_stack: Vec<(u8, String)> = Vec::new();
  let mut used_slugs = HashMap::<String, usize>::new();
  let mut current_heading: Option<HeadingDraft> = None;

  for (event, range) in Parser::new_ext(markdown, markdown_options()).into_offset_iter() {
    match event {
      Event::Start(Tag::Heading { level, .. }) => {
        current_heading = Some(HeadingDraft {
          level: heading_level_to_u8(level),
          text: String::new(),
          line: line_number(markdown, range.start),
          start_offset: range.start,
        });
      }
      Event::Text(text) | Event::Code(text) => {
        if let Some(heading) = current_heading.as_mut() {
          heading.text.push_str(&text);
        }
      }
      Event::End(TagEnd::Heading(_)) => {
        let Some(heading) = current_heading.take() else {
          continue;
        };
        let text = heading.text.trim().to_string();
        if text.is_empty() {
          continue;
        }

        let slug = unique_slug(&text, &mut used_slugs);
        let node_id = heading_node_id(path, &slug);
        let content_start = line_end_offset(markdown, range.end);
        headings.push(ParsedHeading {
          node_id: node_id.clone(),
          start_offset: heading.start_offset,
          content_start,
          content_start_line: heading.line + 1,
        });
        while heading_stack
          .last()
          .is_some_and(|(level, _)| *level >= heading.level)
        {
          heading_stack.pop();
        }
        let parent_id = heading_stack
          .last()
          .map(|(_, id)| id.clone())
          .unwrap_or_else(|| file_node_id(path));

        nodes.push(FsGraphNode {
          id: node_id.clone(),
          kind: "heading".to_string(),
          label: text,
          path: Some(path.to_string()),
          line: Some(heading.line),
          level: Some(heading.level),
          slug: Some(slug),
          content: None,
          content_blocks: None,
          content_start_line: None,
          content_end_line: None,
        });
        edges.push(FsGraphEdge {
          id: format!("{parent_id}->{node_id}-{}", edges.len()),
          source: parent_id,
          target: node_id.clone(),
          kind: "contains".to_string(),
        });
        heading_stack.push((heading.level, node_id));
      }
      _ => {}
    }
  }

  apply_heading_content(markdown, &headings, &mut nodes);

  FsGraph {
    mode: "outline".to_string(),
    nodes,
    edges,
  }
}

#[derive(Debug)]
struct ParsedHeading {
  node_id: String,
  start_offset: usize,
  content_start: usize,
  content_start_line: usize,
}

pub fn build_workspace_graph(index: &FsWorkspaceIndex) -> FsGraph {
  let mut nodes = Vec::new();
  let mut edges = Vec::new();
  let mut file_paths = HashSet::<String>::new();
  let mut heading_nodes_by_id = HashMap::<String, FsGraphNode>::new();
  let mut linked_heading_nodes = HashSet::<String>::new();
  let mut heading_contains_edges = HashSet::<(String, String)>::new();
  let mut external_nodes = HashSet::<String>::new();
  let mut missing_nodes = HashSet::<String>::new();

  for file in &index.files {
    file_paths.insert(file.path.clone());
    nodes.push(FsGraphNode {
      id: file_node_id(&file.path),
      kind: "file".to_string(),
      label: create_file_label(&file.path),
      path: Some(file.path.clone()),
      line: None,
      level: None,
      slug: None,
      content: None,
      content_blocks: None,
      content_start_line: None,
      content_end_line: None,
    });

    for heading in &file.headings {
      let heading_id = heading_node_id(&file.path, &heading.slug);
      heading_nodes_by_id.insert(
        heading_id.clone(),
        FsGraphNode {
          id: heading_id.clone(),
          kind: "heading".to_string(),
          label: heading.text.clone(),
          path: Some(file.path.clone()),
          line: Some(heading.line),
          level: Some(heading.level),
          slug: Some(heading.slug.clone()),
          content: None,
          content_blocks: None,
          content_start_line: None,
          content_end_line: None,
        },
      );
    }
  }

  for file in &index.files {
    let source_id = file_node_id(&file.path);
    for link in &file.links {
      if link.is_external {
        let url = link.target.clone();
        let node_id = external_node_id(&url);
        if external_nodes.insert(node_id.clone()) {
          nodes.push(FsGraphNode {
            id: node_id.clone(),
            kind: "external".to_string(),
            label: if link.text.trim().is_empty() {
              external_label(&url)
            } else {
              link.text.clone()
            },
            path: None,
            line: Some(link.line),
            level: None,
            slug: None,
            content: None,
            content_blocks: None,
            content_start_line: None,
            content_end_line: None,
          });
        }
        edges.push(FsGraphEdge {
          id: format!("{source_id}->{node_id}-{}", edges.len()),
          source: source_id.clone(),
          target: node_id,
          kind: "links_to".to_string(),
        });
        continue;
      }

      let Some(target_path) = link.target_path.as_ref() else {
        continue;
      };
      let mut edge_kind = "links_to".to_string();
      let target_id = if let Some(slug) = link.target_heading_slug.as_ref() {
        let heading_id = heading_node_id(target_path, slug);
        if let Some(heading_node) = heading_nodes_by_id.get(&heading_id) {
          if linked_heading_nodes.insert(heading_id.clone()) {
            nodes.push(heading_node.clone());
          }

          let target_file_id = file_node_id(target_path);
          if heading_contains_edges.insert((target_file_id.clone(), heading_id.clone())) {
            edges.push(FsGraphEdge {
              id: format!("{target_file_id}->{heading_id}-{}", edges.len()),
              source: target_file_id,
              target: heading_id.clone(),
              kind: "contains".to_string(),
            });
          }

          edge_kind = "references_heading".to_string();
          heading_id
        } else if file_paths.contains(target_path) {
          file_node_id(target_path)
        } else {
          missing_node_id(target_path)
        }
      } else if file_paths.contains(target_path) {
        file_node_id(target_path)
      } else {
        missing_node_id(target_path)
      };

      if target_id.starts_with("missing:") && missing_nodes.insert(target_id.clone()) {
        nodes.push(FsGraphNode {
          id: target_id.clone(),
          kind: "missing".to_string(),
          label: create_file_label(target_path),
          path: Some(target_path.clone()),
          line: Some(link.line),
          level: None,
          slug: None,
          content: None,
          content_blocks: None,
          content_start_line: None,
          content_end_line: None,
        });
      }

      edges.push(FsGraphEdge {
        id: format!("{source_id}->{target_id}-{}", edges.len()),
        source: source_id.clone(),
        target: target_id,
        kind: edge_kind,
      });
    }
  }

  FsGraph {
    mode: "mindmap".to_string(),
    nodes,
    edges,
  }
}

fn markdown_options() -> Options {
  let mut options = Options::empty();
  options.insert(Options::ENABLE_STRIKETHROUGH);
  options.insert(Options::ENABLE_TABLES);
  options.insert(Options::ENABLE_TASKLISTS);
  options.insert(Options::ENABLE_FOOTNOTES);
  options
}

fn file_node_id(path: &str) -> String {
  format!("file:{path}")
}

fn heading_node_id(path: &str, slug: &str) -> String {
  format!("heading:{path}:{slug}")
}

fn external_node_id(url: &str) -> String {
  format!("ext:{url}")
}

fn missing_node_id(path: &str) -> String {
  format!("missing:{path}")
}

fn create_file_label(path: &str) -> String {
  path
    .rsplit('/')
    .next()
    .and_then(|name| name.rsplit_once('.').map(|(stem, _)| stem).or(Some(name)))
    .unwrap_or(path)
    .to_string()
}

fn external_label(url: &str) -> String {
  url
    .trim_start_matches("https://")
    .trim_start_matches("http://")
    .split('/')
    .next()
    .unwrap_or(url)
    .to_string()
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

fn line_number(markdown: &str, byte_offset: usize) -> usize {
  markdown
    .as_bytes()
    .iter()
    .take(byte_offset)
    .filter(|byte| **byte == b'\n')
    .count()
    + 1
}

fn line_end_offset(markdown: &str, byte_offset: usize) -> usize {
  markdown[byte_offset..]
    .find('\n')
    .map(|relative| byte_offset + relative + 1)
    .unwrap_or(markdown.len())
}

fn apply_heading_content(markdown: &str, headings: &[ParsedHeading], nodes: &mut [FsGraphNode]) {
  let content_by_id = headings
    .iter()
    .enumerate()
    .map(|(index, heading)| {
      let next_heading_start = headings.get(index + 1).map(|next| next.start_offset);
      let content_end = next_heading_start.unwrap_or(markdown.len());
      let content_end_line = next_heading_start
        .map(|offset| line_number(markdown, offset))
        .unwrap_or_else(|| markdown.lines().count() + 1);
      let content = markdown
        .get(heading.content_start..content_end)
        .unwrap_or_default()
        .trim_matches('\n')
        .to_string();
      (
        heading.node_id.as_str(),
        (
          parse_markdown_blocks(&heading.node_id, &content),
          content,
          heading.content_start_line,
          content_end_line,
        ),
      )
    })
    .collect::<HashMap<_, _>>();

  nodes.iter_mut().for_each(|node| {
    if let Some((blocks, content, start_line, end_line)) = content_by_id.get(node.id.as_str()) {
      node.content = Some(content.clone());
      node.content_blocks = Some(blocks.clone());
      node.content_start_line = Some(*start_line);
      node.content_end_line = Some(*end_line);
    }
  });
}

#[derive(Debug, Default)]
struct TextDraft {
  text: String,
}

#[derive(Debug)]
struct CodeDraft {
  language: Option<String>,
  text: String,
}

#[derive(Debug)]
struct ListDraft {
  ordered: bool,
  items: Vec<String>,
  current_item: Option<String>,
}

fn parse_markdown_blocks(base_id: &str, markdown: &str) -> Vec<FsMarkdownBlock> {
  let mut blocks = Vec::new();
  let mut paragraph: Option<TextDraft> = None;
  let mut blockquote: Option<TextDraft> = None;
  let mut code: Option<CodeDraft> = None;
  let mut list: Option<ListDraft> = None;

  for event in Parser::new_ext(markdown, markdown_options()) {
    match event {
      Event::Start(Tag::Paragraph) if list.is_none() && blockquote.is_none() => {
        paragraph = Some(TextDraft::default());
      }
      Event::End(TagEnd::Paragraph) => {
        if let Some(draft) = paragraph.take() {
          push_text_block(base_id, &mut blocks, "paragraph", draft.text);
        }
      }
      Event::Start(Tag::BlockQuote(_)) => {
        blockquote = Some(TextDraft::default());
      }
      Event::End(TagEnd::BlockQuote(_)) => {
        if let Some(draft) = blockquote.take() {
          push_text_block(base_id, &mut blocks, "blockquote", draft.text);
        }
      }
      Event::Start(Tag::CodeBlock(kind)) => {
        code = Some(CodeDraft {
          language: code_block_language(kind),
          text: String::new(),
        });
      }
      Event::End(TagEnd::CodeBlock) => {
        if let Some(draft) = code.take() {
          let text = draft.text.trim_matches('\n').to_string();
          if !text.is_empty() {
            blocks.push(FsMarkdownBlock {
              id: markdown_block_id(base_id, blocks.len()),
              kind: "code".to_string(),
              text: Some(text),
              level: None,
              language: draft.language,
              ordered: None,
              items: None,
            });
          }
        }
      }
      Event::Start(Tag::List(start)) if list.is_none() => {
        list = Some(ListDraft {
          ordered: start.is_some(),
          items: Vec::new(),
          current_item: None,
        });
      }
      Event::End(TagEnd::List(_)) => {
        if let Some(draft) = list.take() {
          let items = draft
            .items
            .into_iter()
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>();
          if !items.is_empty() {
            blocks.push(FsMarkdownBlock {
              id: markdown_block_id(base_id, blocks.len()),
              kind: "list".to_string(),
              text: None,
              level: None,
              language: None,
              ordered: Some(draft.ordered),
              items: Some(items),
            });
          }
        }
      }
      Event::Start(Tag::Item) => {
        if let Some(draft) = list.as_mut() {
          draft.current_item = Some(String::new());
        }
      }
      Event::End(TagEnd::Item) => {
        if let Some(draft) = list.as_mut() {
          if let Some(item) = draft.current_item.take() {
            draft.items.push(item);
          }
        }
      }
      Event::Rule => {
        blocks.push(FsMarkdownBlock {
          id: markdown_block_id(base_id, blocks.len()),
          kind: "divider".to_string(),
          text: None,
          level: None,
          language: None,
          ordered: None,
          items: None,
        });
      }
      Event::Text(text) | Event::Code(text) => {
        append_markdown_text(
          text.as_ref(),
          &mut code,
          &mut list,
          &mut blockquote,
          &mut paragraph,
        );
      }
      Event::SoftBreak | Event::HardBreak => {
        append_markdown_text("\n", &mut code, &mut list, &mut blockquote, &mut paragraph);
      }
      _ => {}
    }
  }

  blocks
}

fn push_text_block(base_id: &str, blocks: &mut Vec<FsMarkdownBlock>, kind: &str, text: String) {
  let text = text.trim().to_string();
  if text.is_empty() {
    return;
  }
  blocks.push(FsMarkdownBlock {
    id: markdown_block_id(base_id, blocks.len()),
    kind: kind.to_string(),
    text: Some(text),
    level: None,
    language: None,
    ordered: None,
    items: None,
  });
}

fn append_markdown_text(
  text: &str,
  code: &mut Option<CodeDraft>,
  list: &mut Option<ListDraft>,
  blockquote: &mut Option<TextDraft>,
  paragraph: &mut Option<TextDraft>,
) {
  if let Some(draft) = code.as_mut() {
    draft.text.push_str(text);
    return;
  }
  if let Some(draft) = list.as_mut() {
    if let Some(item) = draft.current_item.as_mut() {
      item.push_str(text);
    }
    return;
  }
  if let Some(draft) = blockquote.as_mut() {
    draft.text.push_str(text);
    return;
  }
  if let Some(draft) = paragraph.as_mut() {
    draft.text.push_str(text);
  }
}

fn code_block_language(kind: CodeBlockKind<'_>) -> Option<String> {
  match kind {
    CodeBlockKind::Fenced(language) => {
      let language = language.trim();
      if language.is_empty() {
        None
      } else {
        Some(language.to_string())
      }
    }
    CodeBlockKind::Indented => None,
  }
}

fn markdown_block_id(base_id: &str, index: usize) -> String {
  format!("{base_id}:block:{index}")
}

fn unique_slug(text: &str, used: &mut HashMap<String, usize>) -> String {
  let base = slugify(text);
  let count = used.entry(base.clone()).or_insert(0);
  let slug = if *count == 0 {
    base.clone()
  } else {
    format!("{base}-{}", *count)
  };
  *count += 1;
  slug
}

fn slugify(text: &str) -> String {
  let mut slug = String::new();
  let mut last_dash = false;
  for ch in text.chars() {
    if ch.is_alphanumeric() {
      slug.extend(ch.to_lowercase());
      last_dash = false;
      continue;
    }
    if !last_dash {
      slug.push('-');
      last_dash = true;
    }
  }
  let trimmed = slug.trim_matches('-').to_string();
  if trimmed.is_empty() {
    "heading".to_string()
  } else {
    trimmed
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn builds_outline_from_markdown_events() {
    let graph = build_outline_graph(
      "notes/current.md",
      "# Intro *Now*\n\nLead paragraph\n\n```md\n# Ignored\n```\n\n## Details\nBody\n### Again\n## Details\n",
    );

    let ids = graph
      .nodes
      .iter()
      .map(|node| node.id.as_str())
      .collect::<Vec<_>>();
    assert!(ids.contains(&"file:notes/current.md"));
    assert!(ids.contains(&"heading:notes/current.md:intro-now"));
    assert!(ids.contains(&"heading:notes/current.md:details"));
    assert!(ids.contains(&"heading:notes/current.md:details-1"));
    assert!(!ids.contains(&"heading:notes/current.md:ignored"));
    assert_eq!(graph.edges.len(), 4);
    let intro = graph
      .nodes
      .iter()
      .find(|node| node.id == "heading:notes/current.md:intro-now")
      .expect("intro node");
    assert_eq!(
      intro.content.as_deref(),
      Some("Lead paragraph\n\n```md\n# Ignored\n```")
    );
    assert_eq!(
      intro.content_blocks.as_ref(),
      Some(&vec![
        FsMarkdownBlock {
          id: "heading:notes/current.md:intro-now:block:0".to_string(),
          kind: "paragraph".to_string(),
          text: Some("Lead paragraph".to_string()),
          level: None,
          language: None,
          ordered: None,
          items: None,
        },
        FsMarkdownBlock {
          id: "heading:notes/current.md:intro-now:block:1".to_string(),
          kind: "code".to_string(),
          text: Some("# Ignored".to_string()),
          level: None,
          language: Some("md".to_string()),
          ordered: None,
          items: None,
        },
      ])
    );
    assert_eq!(intro.content_start_line, Some(2));
  }

  #[test]
  fn builds_workspace_mindmap_from_index() {
    let graph = build_workspace_graph(&FsWorkspaceIndex {
      files: vec![
        crate::models::FsIndexedMarkdownFile {
          path: "notes/current.md".to_string(),
          headings: vec![crate::models::FsMarkdownHeading {
            path: "notes/current.md".to_string(),
            level: 1,
            text: "Current".to_string(),
            slug: "current".to_string(),
            line: 1,
          }],
          links: vec![
            crate::models::FsMarkdownLink {
              source_path: "notes/current.md".to_string(),
              text: "Target".to_string(),
              target: "target.md#details".to_string(),
              link_type: "markdown".to_string(),
              target_path: Some("notes/target.md".to_string()),
              target_anchor: Some("details".to_string()),
              target_heading_slug: Some("details".to_string()),
              is_external: false,
              context: String::new(),
              line: 2,
              column: 1,
            },
            crate::models::FsMarkdownLink {
              source_path: "notes/current.md".to_string(),
              text: "Missing".to_string(),
              target: "missing.md".to_string(),
              link_type: "markdown".to_string(),
              target_path: Some("notes/missing.md".to_string()),
              target_anchor: None,
              target_heading_slug: None,
              is_external: false,
              context: String::new(),
              line: 3,
              column: 1,
            },
          ],
        },
        crate::models::FsIndexedMarkdownFile {
          path: "notes/target.md".to_string(),
          headings: vec![crate::models::FsMarkdownHeading {
            path: "notes/target.md".to_string(),
            level: 2,
            text: "Details".to_string(),
            slug: "details".to_string(),
            line: 4,
          }],
          links: vec![],
        },
      ],
    });

    let ids = graph
      .nodes
      .iter()
      .map(|node| node.id.as_str())
      .collect::<Vec<_>>();
    assert_eq!(graph.mode, "mindmap");
    assert!(ids.contains(&"file:notes/current.md"));
    assert!(ids.contains(&"heading:notes/target.md:details"));
    assert!(ids.contains(&"missing:notes/missing.md"));
    assert!(graph.edges.iter().any(|edge| {
      edge.source == "file:notes/current.md"
        && edge.target == "heading:notes/target.md:details"
        && edge.kind == "references_heading"
    }));
  }
}
