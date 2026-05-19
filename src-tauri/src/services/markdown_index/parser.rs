use std::collections::HashMap;

use pulldown_cmark::{Event, HeadingLevel, LinkType, Options, Parser, Tag, TagEnd};
use slug::slugify as ascii_slugify;

use crate::models::FsMarkdownHeading;

use super::types::{ParsedMarkdownDocument, RawMarkdownAsset, RawMarkdownLink};

pub(crate) fn parse_markdown_document(path: &str, content: &str) -> ParsedMarkdownDocument {
  ParsedMarkdownDocument {
    path: path.to_string(),
    headings: extract_headings(path, content),
    links: extract_links(content),
    assets: extract_assets(content),
  }
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

fn extract_assets(content: &str) -> Vec<RawMarkdownAsset> {
  let mut assets = Vec::new();
  let mut current_asset: Option<(String, usize, String)> = None;
  let parser = Parser::new_ext(content, markdown_options()).into_offset_iter();

  for (event, range) in parser {
    match event {
      Event::Start(Tag::Image { dest_url, .. }) => {
        current_asset = Some((dest_url.to_string(), range.start, String::new()));
      }
      Event::End(TagEnd::Image) => {
        let Some((target, byte_index, raw_text)) = current_asset.take() else {
          continue;
        };
        let target = target.trim().to_string();
        if target.is_empty() {
          continue;
        }
        let (line, column) = source_location(content, byte_index);
        assets.push(RawMarkdownAsset {
          target,
          text: raw_text.trim().to_string(),
          context: line_context(content, byte_index),
          line,
          column,
        });
      }
      Event::Text(text) | Event::Code(text) => {
        if let Some((_, _, asset_text)) = current_asset.as_mut() {
          asset_text.push_str(&text);
        }
      }
      Event::SoftBreak | Event::HardBreak => {
        if let Some((_, _, asset_text)) = current_asset.as_mut() {
          asset_text.push(' ');
        }
      }
      _ => {}
    }
  }

  assets
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

pub(super) fn slugify(label: &str) -> String {
  let unicode_slug = unicode_slugify(label);
  if !unicode_slug.is_empty() {
    return unicode_slug;
  }

  ascii_slugify(label)
}

fn unicode_slugify(label: &str) -> String {
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
