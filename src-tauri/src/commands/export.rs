//! Markdown export layer: converts Markdown to various formats.
//! All exporters use pure Rust libraries (no subprocess/exec).

use docx_rs::{BreakType, Docx, Paragraph, Run, RunFonts};
use markdown2pdf::config::ConfigSource;
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

/// Export Markdown to the given format. Uses in-process Rust libraries only.
#[tauri::command]
pub fn export_markdown(
  markdown: String,
  format: String,
  output_path: String,
) -> Result<(), String> {
  let fmt = ExportFormat::from_str(&format)
    .ok_or_else(|| format!("Unsupported export format: {format}"))?;

  match fmt {
    ExportFormat::Pdf => export_to_pdf(&markdown, &output_path),
    ExportFormat::Docx => export_to_docx(&markdown, &output_path),
    ExportFormat::Html => export_to_html(&markdown, &output_path),
  }
}

/// Preprocess markdown to fix patterns that cause markdown2pdf's strict parser to fail
/// (e.g. "Unmatched emphasis" from * or _ in ambiguous contexts).
fn sanitize_markdown_for_pdf(md: &str) -> String {
  let mut out = String::with_capacity(md.len() + 64);
  let mut in_code_block = 0u8; // 0=no, 1=backtick, 2=tilde
  let mut in_inline_code = false;
  let bytes = md.as_bytes();
  let mut i = 0;

  while i < bytes.len() {
    let c = bytes[i] as char;
    let prev = if i > 0 { bytes[i - 1] as char } else { ' ' };
    let next = if i + 1 < bytes.len() {
      bytes[i + 1] as char
    } else {
      ' '
    };

    if in_code_block > 0 {
      out.push(c);
      if (in_code_block == 1 && c == '`') || (in_code_block == 2 && c == '~') {
        let mut j = i;
        while j < bytes.len() && (bytes[j] as char) == c {
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
      while j < bytes.len() && (bytes[j] as char) == '`' {
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

    if c == '~' && i + 2 < bytes.len() {
      if bytes[i] == b'~' && bytes[i + 1] == b'~' && bytes[i + 2] == b'~' {
        out.push_str("~~~");
        i += 3;
        in_code_block = 2;
        continue;
      }
    }

    // Escape * between digits (e.g. 2*3) - markdown2pdf misparses as emphasis
    if c == '*' && prev.is_ascii_digit() && next.is_ascii_digit() {
      out.push('\\');
    }

    out.push(c);
    i += 1;
  }

  out
}

fn export_to_pdf(markdown: &str, output_path: &str) -> Result<(), String> {
  let sanitized = sanitize_markdown_for_pdf(markdown);
  markdown2pdf::parse_into_file(
    sanitized,
    output_path,
    ConfigSource::Default,
    None,
  )
  .map_err(|e| {
    let msg = e.to_string();
    if msg.contains("Unmatched emphasis") {
      format!(
        "{}\n\nTip: The document may contain emphasis syntax (* or _) that markdown2pdf cannot parse. \
Try checking for unmatched * or _, or export as HTML and print to PDF from your browser.",
        msg
      )
    } else {
      format!("Failed to export PDF: {}", msg)
    }
  })
}

fn export_to_html(markdown: &str, output_path: &str) -> Result<(), String> {
  let mut options = Options::empty();
  options.insert(Options::ENABLE_STRIKETHROUGH);
  options.insert(Options::ENABLE_TABLES);
  options.insert(Options::ENABLE_TASKLISTS);
  options.insert(Options::ENABLE_FOOTNOTES);

  let parser = Parser::new_ext(markdown, options);
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
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }}
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
  let mut options = Options::empty();
  options.insert(Options::ENABLE_STRIKETHROUGH);
  options.insert(Options::ENABLE_TABLES);
  options.insert(Options::ENABLE_TASKLISTS);

  let parser = Parser::new_ext(markdown, options);

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
        Tag::BlockQuote => {
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
        let mut run = Run::new().add_text(t);
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
        run_buf.push(
          Run::new()
            .add_text(t)
            .fonts(RunFonts::new().ascii("Consolas")),
        );
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
