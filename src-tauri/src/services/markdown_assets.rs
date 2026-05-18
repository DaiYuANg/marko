use std::path::{Path, PathBuf};

use path_clean::PathClean;
use pathdiff::diff_paths;
use percent_encoding::percent_decode_str;

use crate::{
  models::{FsMarkdownAssetImportResult, FsMarkdownAssetResolveResult},
  services::path_resolver::PathResolver,
  state::{FsState, FsStateData},
};

#[derive(Debug, Default, Clone, Copy)]
pub struct MarkdownAssetService {
  path_resolver: PathResolver,
}

impl MarkdownAssetService {
  pub fn new(path_resolver: PathResolver) -> Self {
    Self { path_resolver }
  }

  pub async fn import_asset(
    &self,
    source_path: String,
    document_path: String,
    strategy: String,
    title: Option<String>,
    state: &FsState,
  ) -> Result<FsMarkdownAssetImportResult, String> {
    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    let source_path = PathBuf::from(source_path).clean();
    let document_abs = self.path_resolver.resolve(&data, &document_path)?;

    tokio::task::spawn_blocking(move || {
      import_markdown_asset_blocking(&data, source_path, &document_abs, &strategy, title)
    })
    .await
    .map_err(|err| format!("Markdown asset import task failed: {err}"))?
  }

  pub async fn import_asset_bytes(
    &self,
    file_name: String,
    bytes: Vec<u8>,
    document_path: String,
    title: Option<String>,
    state: &FsState,
  ) -> Result<FsMarkdownAssetImportResult, String> {
    if bytes.is_empty() {
      return Err("Asset content must not be empty".to_string());
    }

    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    let document_abs = self.path_resolver.resolve(&data, &document_path)?;

    tokio::task::spawn_blocking(move || {
      copy_asset_bytes_to_document_assets(
        &data,
        &file_name,
        &bytes,
        &document_abs,
        title.as_deref(),
      )
    })
    .await
    .map_err(|err| format!("Markdown asset import task failed: {err}"))?
  }

  pub async fn resolve_asset(
    &self,
    document_path: String,
    target: String,
    state: &FsState,
  ) -> Result<FsMarkdownAssetResolveResult, String> {
    let data = state
      .0
      .read()
      .map_err(|_| "Failed to lock fs state")?
      .clone();
    let document_abs = self.path_resolver.resolve(&data, &document_path)?;

    tokio::task::spawn_blocking(move || {
      resolve_markdown_asset_blocking(&data, &document_path, &document_abs, &target)
    })
    .await
    .map_err(|err| format!("Markdown asset resolve task failed: {err}"))?
  }
}

fn import_markdown_asset_blocking(
  data: &FsStateData,
  source_path: PathBuf,
  document_abs: &Path,
  strategy: &str,
  title: Option<String>,
) -> Result<FsMarkdownAssetImportResult, String> {
  let metadata = std::fs::metadata(&source_path)
    .map_err(|err| format!("Failed to read source asset metadata: {err}"))?;
  if !metadata.is_file() {
    return Err("Source asset must be a file".to_string());
  }

  match strategy {
    "preserve-path" => preserve_asset_path(&source_path, document_abs),
    "copy-to-document-assets" | "" => {
      copy_asset_to_document_assets(data, source_path, document_abs, title.as_deref())
    }
    other => Err(format!("Unsupported Markdown asset strategy: {other}")),
  }
}

fn preserve_asset_path(
  source_path: &Path,
  document_abs: &Path,
) -> Result<FsMarkdownAssetImportResult, String> {
  let document_dir = document_abs
    .parent()
    .ok_or_else(|| "Markdown document has no parent directory".to_string())?;
  let markdown_target = diff_paths(source_path, document_dir)
    .unwrap_or_else(|| source_path.to_path_buf())
    .to_string_lossy()
    .replace('\\', "/");

  Ok(FsMarkdownAssetImportResult {
    markdown_target: normalize_empty_relative_target(markdown_target),
    relative_path: source_path.to_string_lossy().replace('\\', "/"),
    absolute_path: source_path.to_string_lossy().to_string(),
    asset_dir: None,
    copied: false,
  })
}

fn copy_asset_to_document_assets(
  data: &FsStateData,
  source_path: PathBuf,
  document_abs: &Path,
  title: Option<&str>,
) -> Result<FsMarkdownAssetImportResult, String> {
  let document_dir = document_abs
    .parent()
    .ok_or_else(|| "Markdown document has no parent directory".to_string())?;
  let document_stem = document_abs
    .file_stem()
    .and_then(|value| value.to_str())
    .unwrap_or("document");
  let asset_dir_name = format!(
    "{}.assets",
    sanitize_asset_dir_name(title.unwrap_or(document_stem))
  );
  let asset_dir_abs = document_dir.join(&asset_dir_name).clean();
  ensure_workspace_descendant(data, &asset_dir_abs)?;
  std::fs::create_dir_all(&asset_dir_abs)
    .map_err(|err| format!("Failed to create asset directory: {err}"))?;

  let file_name = source_path
    .file_name()
    .and_then(|value| value.to_str())
    .ok_or_else(|| "Source asset has no valid file name".to_string())?;
  let target_abs = unique_target_path(&asset_dir_abs, file_name);
  std::fs::copy(&source_path, &target_abs).map_err(|err| format!("Failed to copy asset: {err}"))?;

  copied_asset_result(data, document_dir, target_abs, asset_dir_name)
}

fn copy_asset_bytes_to_document_assets(
  data: &FsStateData,
  file_name: &str,
  bytes: &[u8],
  document_abs: &Path,
  title: Option<&str>,
) -> Result<FsMarkdownAssetImportResult, String> {
  let document_dir = document_abs
    .parent()
    .ok_or_else(|| "Markdown document has no parent directory".to_string())?;
  let document_stem = document_abs
    .file_stem()
    .and_then(|value| value.to_str())
    .unwrap_or("document");
  let asset_dir_name = format!(
    "{}.assets",
    sanitize_asset_dir_name(title.unwrap_or(document_stem))
  );
  let asset_dir_abs = document_dir.join(&asset_dir_name).clean();
  ensure_workspace_descendant(data, &asset_dir_abs)?;
  std::fs::create_dir_all(&asset_dir_abs)
    .map_err(|err| format!("Failed to create asset directory: {err}"))?;

  let target_abs = unique_target_path(&asset_dir_abs, file_name);
  std::fs::write(&target_abs, bytes).map_err(|err| format!("Failed to write asset: {err}"))?;

  copied_asset_result(data, document_dir, target_abs, asset_dir_name)
}

fn copied_asset_result(
  data: &FsStateData,
  document_dir: &Path,
  target_abs: PathBuf,
  asset_dir_name: String,
) -> Result<FsMarkdownAssetImportResult, String> {
  let markdown_target = diff_paths(&target_abs, document_dir)
    .unwrap_or_else(|| target_abs.clone())
    .to_string_lossy()
    .replace('\\', "/");
  let relative_path = workspace_relative_path(data, &target_abs)?;

  Ok(FsMarkdownAssetImportResult {
    markdown_target: normalize_empty_relative_target(markdown_target),
    relative_path,
    absolute_path: target_abs.to_string_lossy().to_string(),
    asset_dir: Some(asset_dir_name),
    copied: true,
  })
}

fn resolve_markdown_asset_blocking(
  data: &FsStateData,
  document_path: &str,
  document_abs: &Path,
  target: &str,
) -> Result<FsMarkdownAssetResolveResult, String> {
  let trimmed_target = target.trim();
  if trimmed_target.is_empty() {
    return Err("Asset target must not be empty".to_string());
  }

  if is_external_asset_target(trimmed_target) {
    return Ok(FsMarkdownAssetResolveResult {
      source_path: document_path.to_string(),
      target: trimmed_target.to_string(),
      absolute_path: None,
      relative_path: None,
      is_external: true,
      media_type: guess_media_type(trimmed_target),
      exists: false,
    });
  }

  let document_dir = document_abs
    .parent()
    .ok_or_else(|| "Markdown document has no parent directory".to_string())?;
  let local_target = decode_local_asset_target(trimmed_target);
  let target_path = Path::new(&local_target);
  let absolute_path = if target_path.is_absolute() {
    target_path.to_path_buf()
  } else {
    document_dir.join(target_path)
  }
  .clean();
  let relative_path = diff_paths(&absolute_path, workspace_root(data))
    .map(|path| path.to_string_lossy().replace('\\', "/"));
  let exists = absolute_path.is_file();

  Ok(FsMarkdownAssetResolveResult {
    source_path: document_path.to_string(),
    target: trimmed_target.to_string(),
    absolute_path: Some(absolute_path.to_string_lossy().to_string()),
    relative_path,
    is_external: false,
    media_type: guess_media_type(&local_target),
    exists,
  })
}

fn is_external_asset_target(target: &str) -> bool {
  let lower = target.to_ascii_lowercase();
  lower.starts_with("http://")
    || lower.starts_with("https://")
    || lower.starts_with("data:")
    || lower.starts_with("blob:")
    || lower.starts_with("asset:")
    || lower.starts_with("file:")
}

fn decode_local_asset_target(target: &str) -> String {
  let path_part = target
    .split_once('#')
    .map(|(path, _)| path)
    .unwrap_or(target)
    .split_once('?')
    .map(|(path, _)| path)
    .unwrap_or(target);

  percent_decode_str(path_part)
    .decode_utf8_lossy()
    .to_string()
}

fn guess_media_type(path: &str) -> Option<String> {
  let extension = Path::new(path)
    .extension()
    .and_then(|value| value.to_str())?
    .to_ascii_lowercase();
  let media_type = match extension.as_str() {
    "apng" => "image/apng",
    "avif" => "image/avif",
    "bmp" => "image/bmp",
    "gif" => "image/gif",
    "jpeg" | "jpg" => "image/jpeg",
    "pdf" => "application/pdf",
    "png" => "image/png",
    "svg" => "image/svg+xml",
    "webp" => "image/webp",
    _ => return None,
  };
  Some(media_type.to_string())
}

fn ensure_workspace_descendant(data: &FsStateData, path: &Path) -> Result<(), String> {
  let workspace_root = workspace_root(data);
  if path.starts_with(&workspace_root) {
    return Ok(());
  }
  Err("Asset target must stay inside the current workspace".to_string())
}

fn workspace_relative_path(data: &FsStateData, path: &Path) -> Result<String, String> {
  let workspace_root = workspace_root(data);
  diff_paths(path, &workspace_root)
    .ok_or_else(|| "Failed to compute workspace relative asset path".to_string())
    .map(|path| path.to_string_lossy().replace('\\', "/"))
}

fn workspace_root(data: &FsStateData) -> PathBuf {
  if data.root_kind == "single" {
    data
      .single_file
      .as_ref()
      .and_then(|path| path.parent().map(Path::to_path_buf))
      .unwrap_or_else(|| data.root_path.clone())
  } else {
    data.root_path.clone()
  }
  .clean()
}

fn unique_target_path(asset_dir: &Path, file_name: &str) -> PathBuf {
  let original = Path::new(file_name);
  let stem = sanitize_file_stem(
    original
      .file_stem()
      .and_then(|value| value.to_str())
      .unwrap_or("asset"),
  );
  let extension = original
    .extension()
    .and_then(|value| value.to_str())
    .map(sanitize_file_extension);
  let candidate = file_name_with_extension(&stem, extension.as_deref());
  let first = asset_dir.join(&candidate);
  if !first.exists() {
    return first;
  }

  for index in 1.. {
    let candidate = file_name_with_extension(&format!("{stem}-{index}"), extension.as_deref());
    let path = asset_dir.join(candidate);
    if !path.exists() {
      return path;
    }
  }
  unreachable!("asset file names should eventually find a free suffix")
}

fn file_name_with_extension(stem: &str, extension: Option<&str>) -> String {
  match extension {
    Some(extension) if !extension.is_empty() => format!("{stem}.{extension}"),
    _ => stem.to_string(),
  }
}

fn sanitize_asset_dir_name(value: &str) -> String {
  let sanitized = sanitize_file_stem(value);
  if sanitized.is_empty() {
    "document".to_string()
  } else {
    sanitized
  }
}

fn sanitize_file_stem(value: &str) -> String {
  let sanitized = value
    .chars()
    .map(|ch| {
      if ch.is_control() || matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
        '-'
      } else {
        ch
      }
    })
    .collect::<String>();
  sanitized
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
    .trim_matches(['.', ' '])
    .to_string()
}

fn sanitize_file_extension(value: &str) -> String {
  value
    .chars()
    .filter(|ch| ch.is_ascii_alphanumeric())
    .collect::<String>()
}

fn normalize_empty_relative_target(value: String) -> String {
  if value.is_empty() {
    ".".to_string()
  } else {
    value
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn temp_dir() -> PathBuf {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system time should be valid")
      .as_nanos();
    let path = std::env::temp_dir().join(format!("marko-assets-{}-{nanos}", std::process::id()));
    std::fs::create_dir_all(&path).expect("temp dir should be created");
    path
  }

  fn fs_data(root: &Path) -> FsStateData {
    FsStateData {
      root_kind: "external".to_string(),
      root_path: root.to_path_buf(),
      internal_root: PathBuf::new(),
      single_file: None,
    }
  }

  #[test]
  fn copies_asset_to_document_assets_dir() {
    let root = temp_dir();
    let source = root.join("incoming").join("logo.png");
    std::fs::create_dir_all(source.parent().expect("source parent")).expect("source parent dir");
    std::fs::write(&source, b"png").expect("source asset should be written");
    let document = root.join("notes").join("Daily.md");
    std::fs::create_dir_all(document.parent().expect("document parent"))
      .expect("document parent dir");
    std::fs::write(&document, "# Daily").expect("document should be written");

    let result =
      copy_asset_to_document_assets(&fs_data(&root), source, &document, Some("今日记录"))
        .expect("asset should copy");

    assert_eq!(result.markdown_target, "今日记录.assets/logo.png");
    assert_eq!(result.relative_path, "notes/今日记录.assets/logo.png");
    assert_eq!(result.asset_dir.as_deref(), Some("今日记录.assets"));
    assert!(Path::new(&result.absolute_path).exists());
    let _ = std::fs::remove_dir_all(root);
  }

  #[test]
  fn preserves_asset_path_without_copying() {
    let root = temp_dir();
    let source = root.join("assets").join("logo.png");
    std::fs::create_dir_all(source.parent().expect("source parent")).expect("source parent dir");
    std::fs::write(&source, b"png").expect("source asset should be written");
    let document = root.join("notes").join("Daily.md");
    std::fs::create_dir_all(document.parent().expect("document parent"))
      .expect("document parent dir");
    std::fs::write(&document, "# Daily").expect("document should be written");

    let result = preserve_asset_path(&source, &document).expect("asset path should preserve");

    assert_eq!(result.markdown_target, "../assets/logo.png");
    assert!(!result.copied);
    let _ = std::fs::remove_dir_all(root);
  }

  #[test]
  fn writes_clipboard_asset_bytes_to_document_assets_dir() {
    let root = temp_dir();
    let document = root.join("notes").join("Daily.md");
    std::fs::create_dir_all(document.parent().expect("document parent"))
      .expect("document parent dir");
    std::fs::write(&document, "# Daily").expect("document should be written");

    let result =
      copy_asset_bytes_to_document_assets(&fs_data(&root), "pasted.png", b"png", &document, None)
        .expect("asset bytes should write");

    assert_eq!(result.markdown_target, "Daily.assets/pasted.png");
    assert_eq!(result.relative_path, "notes/Daily.assets/pasted.png");
    assert!(Path::new(&result.absolute_path).exists());
    let _ = std::fs::remove_dir_all(root);
  }

  #[test]
  fn resolves_relative_asset_target_from_document_dir() {
    let root = temp_dir();
    let document = root.join("notes").join("Daily.md");
    let asset = root.join("notes").join("Daily.assets").join("logo.png");
    std::fs::create_dir_all(asset.parent().expect("asset parent")).expect("asset parent dir");
    std::fs::write(&document, "# Daily").expect("document should be written");
    std::fs::write(&asset, b"png").expect("asset should be written");

    let result = resolve_markdown_asset_blocking(
      &fs_data(&root),
      "notes/Daily.md",
      &document,
      "Daily.assets/logo.png",
    )
    .expect("asset should resolve");

    assert_eq!(
      result.relative_path.as_deref(),
      Some("notes/Daily.assets/logo.png")
    );
    assert_eq!(result.media_type.as_deref(), Some("image/png"));
    assert!(result.exists);
    let _ = std::fs::remove_dir_all(root);
  }

  #[test]
  fn resolves_parent_relative_asset_target_from_document_dir() {
    let root = temp_dir();
    let document = root.join("notes").join("Daily.md");
    let asset = root.join("assets").join("logo.png");
    std::fs::create_dir_all(document.parent().expect("document parent"))
      .expect("document parent dir");
    std::fs::create_dir_all(asset.parent().expect("asset parent")).expect("asset parent dir");
    std::fs::write(&document, "# Daily").expect("document should be written");
    std::fs::write(&asset, b"png").expect("asset should be written");

    let result = resolve_markdown_asset_blocking(
      &fs_data(&root),
      "notes/Daily.md",
      &document,
      "../assets/logo.png",
    )
    .expect("asset should resolve");

    assert_eq!(result.relative_path.as_deref(), Some("assets/logo.png"));
    assert!(result.exists);
    let _ = std::fs::remove_dir_all(root);
  }

  #[test]
  fn keeps_external_asset_target_unresolved() {
    let root = temp_dir();
    let document = root.join("Daily.md");
    std::fs::write(&document, "# Daily").expect("document should be written");

    let result = resolve_markdown_asset_blocking(
      &fs_data(&root),
      "Daily.md",
      &document,
      "https://example.com/logo.png",
    )
    .expect("external asset should resolve");

    assert!(result.is_external);
    assert!(result.absolute_path.is_none());
    assert!(!result.exists);
    let _ = std::fs::remove_dir_all(root);
  }
}
