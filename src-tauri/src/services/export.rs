//! Markdown export service: converts Markdown to various formats.
//! All exporters use pure Rust libraries (no subprocess/exec).

use docx_rs::{BreakType, Docx, Paragraph, Run, RunFonts};
use mdxport::{Options as PdfExportOptions, Style as PdfExportStyle};
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};

/// Supported export formats.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportFormat {
  Pdf,
  Docx,
  Html,
}

impl ExportFormat {
  pub fn from_str(s: &str) -> Option<Self> {
    match s.to_lowercase().as_str() {
      "pdf" => Some(Self::Pdf),
      "docx" | "word" => Some(Self::Docx),
      "html" => Some(Self::Html),
      _ => None,
    }
  }

  #[allow(dead_code)]
  pub fn default_extension(&self) -> &'static str {
    match self {
      Self::Pdf => "pdf",
      Self::Docx => "docx",
      Self::Html => "html",
    }
  }

  #[allow(dead_code)]
  pub fn filter_name(&self) -> &'static str {
    match self {
      Self::Pdf => "PDF",
      Self::Docx => "Word",
      Self::Html => "HTML",
    }
  }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct ExportService;

impl ExportService {
  pub fn export_markdown(
    &self,
    markdown: &str,
    format: &str,
    output_path: &str,
  ) -> Result<(), String> {
    let fmt = ExportFormat::from_str(format)
      .ok_or_else(|| format!("Unsupported export format: {format}"))?;

    match fmt {
      ExportFormat::Pdf => export_to_pdf(markdown, output_path),
      ExportFormat::Docx => export_to_docx(markdown, output_path),
      ExportFormat::Html => export_to_html(markdown, output_path),
    }
  }

  pub async fn export_markdown_blocking(
    &self,
    markdown: String,
    format: String,
    output_path: String,
  ) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
      ExportService.export_markdown(&markdown, &format, &output_path)
    })
    .await
    .map_err(|err| format!("Export task failed: {err}"))?
  }
}

/// Normalize editor-produced Markdown into portable Markdown before exporting.
fn normalize_markdown_for_export(md: &str) -> String {
  let mut out = String::with_capacity(md.len() + 64);
  let mut in_code_block = 0u8; // 0=no, 1=backtick, 2=tilde
  let mut in_inline_code = false;
  let chars: Vec<(usize, char)> = md.char_indices().collect();
  let mut i = 0;

  while i < chars.len() {
    let (byte_index, c) = chars[i];
    let prev = if i > 0 { chars[i - 1].1 } else { ' ' };
    let next = chars.get(i + 1).map(|(_, c)| *c).unwrap_or(' ');

    if in_code_block > 0 {
      out.push(c);
      if (in_code_block == 1 && c == '`') || (in_code_block == 2 && c == '~') {
        let mut j = i;
        while j < chars.len() && chars[j].1 == c {
          j += 1;
        }
        if j - i >= 3 {
          i = j;
          in_code_block = 0;
        } else {
          i += 1;
        }
      } else {
        i += 1;
      }
      continue;
    }

    if c == '`' {
      let mut j = i;
      while j < chars.len() && chars[j].1 == '`' {
        j += 1;
      }
      let n = j - i;
      for _ in 0..n {
        out.push('`');
      }
      i = j;
      if n >= 3 {
        in_code_block = 1;
      } else {
        in_inline_code = !in_inline_code;
      }
      continue;
    }

    if in_inline_code {
      out.push(c);
      i += 1;
      continue;
    }

    if c == '<' {
      if let Some((replacement, consumed)) = html_break_replacement(&md[byte_index..]) {
        out.push_str(replacement);
        i += md[byte_index..byte_index + consumed].chars().count();
        continue;
      }
    }

    if c == '~'
      && i + 2 < chars.len()
      && chars[i].1 == '~'
      && chars[i + 1].1 == '~'
      && chars[i + 2].1 == '~'
    {
      out.push_str("~~~");
      i += 3;
      in_code_block = 2;
      continue;
    }

    // Keep numeric expressions like 2*3 from being parsed as emphasis.
    if c == '*' && prev.is_ascii_digit() && next.is_ascii_digit() {
      out.push('\\');
    }

    out.push(c);
    i += 1;
  }

  out
}

fn export_to_pdf(markdown: &str, output_path: &str) -> Result<(), String> {
  let normalized = normalize_markdown_for_export(markdown);
  let pdf = mdxport::markdown_to_pdf(
    &normalized,
    &PdfExportOptions {
      style: PdfExportStyle::ModernTech,
      lang: Some("zh".to_string()),
      ..PdfExportOptions::default()
    },
  )
  .map_err(|e| format!("Failed to export PDF: {}", e))?;

  std::fs::write(output_path, pdf).map_err(|e| format!("Failed to write PDF: {}", e))
}

fn export_to_html(markdown: &str, output_path: &str) -> Result<(), String> {
  let markdown = normalize_markdown_for_export(markdown);
  let mut options = Options::empty();
  options.insert(Options::ENABLE_STRIKETHROUGH);
  options.insert(Options::ENABLE_TABLES);
  options.insert(Options::ENABLE_TASKLISTS);
  options.insert(Options::ENABLE_FOOTNOTES);

  let parser = Parser::new_ext(&markdown, options);
  let mut body = String::new();
  pulldown_cmark::html::push_html(&mut body, parser);

  let html = format!(
    r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exported Document</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #111827; }}
    pre {{ background: #f5f5f5; padding: 1rem; overflow-x: auto; border-radius: 4px; }}
    code {{ font-family: ui-monospace, monospace; background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 4px; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; }}
    th {{ background: #f5f5f5; }}
  </style>
</head>
<body>
{}
</body>
</html>"#,
    body
  );

  std::fs::write(output_path, html).map_err(|e| format!("Failed to write HTML: {}", e))
}

fn export_to_docx(markdown: &str, output_path: &str) -> Result<(), String> {
  let markdown = normalize_markdown_for_export(markdown);
  let mut options = Options::empty();
  options.insert(Options::ENABLE_STRIKETHROUGH);
  options.insert(Options::ENABLE_TABLES);
  options.insert(Options::ENABLE_TASKLISTS);

  let parser = Parser::new_ext(&markdown, options);

  let mut docx = Docx::new();
  let mut run_buf: Vec<Run> = Vec::new();
  let mut bold = false;
  let mut italic = false;
  let mut strike = false;
  let mut heading_style: Option<String> = None;

  fn flush_para(docx: Docx, run_buf: &mut Vec<Run>, heading_style: &Option<String>) -> Docx {
    if run_buf.is_empty() {
      return docx;
    }
    let mut p = Paragraph::new();
    if let Some(style) = heading_style {
      p = p.style(style);
    }
    for run in run_buf.drain(..) {
      p = p.add_run(run);
    }
    docx.add_paragraph(p)
  }

  for event in parser {
    match event {
      Event::Start(tag) => match &tag {
        Tag::Heading { level, .. } => {
          docx = flush_para(docx, &mut run_buf, &heading_style);
          heading_style = Some(format!("Heading{}", (*level as u8)));
        }
        Tag::Paragraph => {
          docx = flush_para(docx, &mut run_buf, &heading_style);
          heading_style = None;
        }
        Tag::CodeBlock(_) => {
          docx = flush_para(docx, &mut run_buf, &heading_style);
          heading_style = None;
        }
        Tag::BlockQuote(_) => {
          docx = flush_para(docx, &mut run_buf, &heading_style);
        }
        Tag::List(_) | Tag::Item => {
          docx = flush_para(docx, &mut run_buf, &heading_style);
          heading_style = None;
        }
        Tag::Table(_) | Tag::TableHead | Tag::TableRow | Tag::TableCell => {
          docx = flush_para(docx, &mut run_buf, &heading_style);
          heading_style = None;
        }
        Tag::Emphasis => italic = true,
        Tag::Strong => bold = true,
        Tag::Strikethrough => strike = true,
        Tag::Link { .. } | Tag::Image { .. } => {}
        _ => {}
      },
      Event::End(end_tag) => match end_tag {
        TagEnd::Paragraph | TagEnd::Heading(_) => {
          docx = flush_para(docx, &mut run_buf, &heading_style);
          heading_style = None;
        }
        TagEnd::CodeBlock => {
          docx = flush_para(docx, &mut run_buf, &heading_style);
        }
        TagEnd::Emphasis => italic = false,
        TagEnd::Strong => bold = false,
        TagEnd::Strikethrough => strike = false,
        _ => {}
      },
      Event::Text(text) => {
        let t = text.to_string();
        let mut run = Run::new().add_text(t).fonts(default_docx_fonts());
        if bold {
          run = run.bold();
        }
        if italic {
          run = run.italic();
        }
        if strike {
          run = run.strike();
        }
        run_buf.push(run);
      }
      Event::Code(text) => {
        let t = text.to_string();
        run_buf.push(Run::new().add_text(t).fonts(code_docx_fonts()));
      }
      Event::SoftBreak => {
        run_buf.push(Run::new().add_break(BreakType::TextWrapping));
      }
      Event::HardBreak => {
        docx = flush_para(docx, &mut run_buf, &heading_style);
        docx = docx
          .add_paragraph(Paragraph::new().add_run(Run::new().add_break(BreakType::TextWrapping)));
      }
      Event::Rule => {
        docx = flush_para(docx, &mut run_buf, &heading_style);
        heading_style = None;
      }
      _ => {}
    }
  }

  docx = flush_para(docx, &mut run_buf, &heading_style);

  let file =
    std::fs::File::create(output_path).map_err(|e| format!("Failed to create file: {}", e))?;
  docx
    .build()
    .pack(file)
    .map_err(|e| format!("Failed to write DOCX: {}", e))?;
  Ok(())
}

fn default_docx_fonts() -> RunFonts {
  RunFonts::new()
    .ascii(docx_latin_font())
    .east_asia(docx_east_asia_font())
    .cs(docx_east_asia_font())
}

fn html_break_replacement(input: &str) -> Option<(&'static str, usize)> {
  let variants = [
    ("<br>", "\n"),
    ("<br/>", "\n"),
    ("<br />", "\n"),
    ("</br>", "\n"),
    ("<BR>", "\n"),
    ("<BR/>", "\n"),
    ("<BR />", "\n"),
    ("</BR>", "\n"),
  ];

  variants
    .iter()
    .find_map(|(tag, replacement)| input.starts_with(tag).then_some((*replacement, tag.len())))
}

fn code_docx_fonts() -> RunFonts {
  RunFonts::new()
    .ascii(docx_code_font())
    .east_asia(docx_east_asia_font())
    .cs(docx_east_asia_font())
}

fn docx_latin_font() -> &'static str {
  if cfg!(target_os = "macos") {
    "Aptos"
  } else if cfg!(target_os = "windows") {
    "Aptos"
  } else {
    "Noto Sans"
  }
}

fn docx_east_asia_font() -> &'static str {
  if cfg!(target_os = "macos") {
    "PingFang SC"
  } else if cfg!(target_os = "windows") {
    "Microsoft YaHei"
  } else {
    "Noto Sans CJK SC"
  }
}

fn docx_code_font() -> &'static str {
  if cfg!(target_os = "macos") {
    "SF Mono"
  } else if cfg!(target_os = "windows") {
    "Cascadia Mono"
  } else {
    "DejaVu Sans Mono"
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn temp_export_path(ext: &str) -> String {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system time should be after unix epoch")
      .as_nanos();
    std::env::temp_dir()
      .join(format!(
        "marko-export-{}-{}.{}",
        std::process::id(),
        nanos,
        ext
      ))
      .to_string_lossy()
      .into_owned()
  }

  #[test]
  fn html_export_writes_utf8_chinese_document() {
    let path = temp_export_path("html");

    export_to_html("# 标题\n\n中文正文", &path).expect("html export should succeed");

    let html = fs::read_to_string(&path).expect("html should be readable as utf8");
    let _ = fs::remove_file(&path);

    assert!(html.contains("<meta charset=\"UTF-8\">"));
    assert!(html.contains("<h1>标题</h1>"));
    assert!(html.contains("中文正文"));
  }

  #[test]
  fn docx_export_writes_non_empty_chinese_document() {
    let path = temp_export_path("docx");

    export_to_docx("# 标题\n\n中文正文和 `code`", &path).expect("docx export should succeed");

    let metadata = fs::metadata(&path).expect("docx should exist");
    let _ = fs::remove_file(&path);

    assert!(metadata.len() > 0);
  }

  #[test]
  fn pdf_export_writes_non_empty_chinese_document() {
    let path = temp_export_path("pdf");

    export_to_pdf("# 标题\n\n中文正文<br />下一行", &path).expect("pdf export should succeed");

    let metadata = fs::metadata(&path).expect("pdf should exist");
    if let Ok(keep_path) = std::env::var("MARKO_KEEP_EXPORT_TEST_PDF") {
      fs::copy(&path, keep_path).expect("pdf should be copied for inspection");
    }
    let _ = fs::remove_file(&path);

    assert!(metadata.len() > 0);
  }

  #[test]
  fn sanitize_keeps_code_and_escapes_numeric_asterisk() {
    let sanitized = normalize_markdown_for_export("计算 2*3<br />下一行\n\n`2*3`\n");

    assert!(sanitized.contains("2\\*3"));
    assert!(sanitized.contains("下一行"));
    assert!(sanitized.contains("`2*3`"));
  }
}
