use std::path::{Path, PathBuf};

use gix::bstr::ByteSlice;
use path_clean::PathClean;
use similar::TextDiff;

use crate::models::{GitFileChange, GitFileDiff, GitRepoInfo, GitStatusSnapshot};

#[derive(Debug, Default)]
pub struct GitService;

impl GitService {
  pub async fn discover(&self, root_path: String) -> Result<GitRepoInfo, String> {
    let root = PathBuf::from(root_path);
    tokio::task::spawn_blocking(move || discover_repo(&root))
      .await
      .map_err(|err| format!("Failed to join git discovery task: {err}"))?
  }

  pub async fn init(&self, root_path: String) -> Result<GitRepoInfo, String> {
    let root = PathBuf::from(root_path);
    tokio::task::spawn_blocking(move || init_repo(&root))
      .await
      .map_err(|err| format!("Failed to join git init task: {err}"))?
  }

  pub async fn status(&self, root_path: String) -> Result<GitStatusSnapshot, String> {
    let root = PathBuf::from(root_path);
    tokio::task::spawn_blocking(move || status_snapshot(&root))
      .await
      .map_err(|err| format!("Failed to join git status task: {err}"))?
  }

  pub async fn file_diff(
    &self,
    root_path: String,
    path: String,
    section: Option<String>,
  ) -> Result<GitFileDiff, String> {
    let root = PathBuf::from(root_path);
    tokio::task::spawn_blocking(move || file_diff(&root, &path, section.as_deref()))
      .await
      .map_err(|err| format!("Failed to join git diff task: {err}"))?
  }
}

fn discover_repo(root: &Path) -> Result<GitRepoInfo, String> {
  if !root.exists() {
    return Err(format!("Path does not exist: {}", root.display()));
  }
  if !root.is_dir() {
    return Ok(empty_repo_info());
  }

  match gix::discover(root) {
    Ok(repo) => Ok(repo_info(&repo)),
    Err(_) => Ok(empty_repo_info()),
  }
}

fn init_repo(root: &Path) -> Result<GitRepoInfo, String> {
  if !root.exists() {
    return Err(format!("Path does not exist: {}", root.display()));
  }
  if !root.is_dir() {
    return Err(format!(
      "Git repository can only be initialized for a directory: {}",
      root.display()
    ));
  }
  if gix::discover(root).is_ok() {
    return discover_repo(root);
  }

  let repo =
    gix::init(root).map_err(|err| format!("Failed to initialize git repository: {err}"))?;
  Ok(repo_info(&repo))
}

fn status_snapshot(root: &Path) -> Result<GitStatusSnapshot, String> {
  let repo = match gix::discover(root) {
    Ok(repo) => repo,
    Err(_) => {
      return Ok(GitStatusSnapshot {
        repo: empty_repo_info(),
        staged: Vec::new(),
        unstaged: Vec::new(),
        untracked: Vec::new(),
        conflicts: Vec::new(),
      })
    }
  };

  let repo_info = repo_info(&repo);
  let mut staged = Vec::new();
  let mut unstaged = Vec::new();
  let mut untracked = Vec::new();
  let mut conflicts = Vec::new();

  let iter = repo
    .status(gix::progress::Discard)
    .map_err(|err| format!("Failed to prepare git status: {err}"))?
    .untracked_files(gix::status::UntrackedFiles::Files)
    .index_worktree_submodules(None)
    .into_iter(Vec::new())
    .map_err(|err| format!("Failed to read git status: {err}"))?;

  for item in iter {
    let item = item.map_err(|err| format!("Failed to iterate git status: {err}"))?;
    match item {
      gix::status::Item::TreeIndex(change) => staged.push(staged_change(change)),
      gix::status::Item::IndexWorktree(change) => {
        let change = worktree_change(change);
        if change.status == "untracked" {
          untracked.push(change);
        } else if change.status == "conflicted" {
          conflicts.push(change);
        } else {
          unstaged.push(change);
        }
      }
    }
  }

  staged.sort_by(|left, right| left.path.cmp(&right.path));
  unstaged.sort_by(|left, right| left.path.cmp(&right.path));
  untracked.sort_by(|left, right| left.path.cmp(&right.path));
  conflicts.sort_by(|left, right| left.path.cmp(&right.path));

  Ok(GitStatusSnapshot {
    repo: repo_info,
    staged,
    unstaged,
    untracked,
    conflicts,
  })
}

fn file_diff(
  root: &Path,
  relative_path: &str,
  section: Option<&str>,
) -> Result<GitFileDiff, String> {
  let repo =
    gix::discover(root).map_err(|err| format!("Failed to discover git repository: {err}"))?;
  let safe_path = normalize_repo_relative_path(relative_path)?;
  let workdir = repo
    .workdir()
    .ok_or_else(|| "Git diff requires a repository with a working tree".to_string())?;
  let worktree_path = workdir.join(&safe_path);

  let head_content = head_blob_content(&repo, &safe_path)?;
  let index_content = index_blob_content(&repo, &safe_path)?;
  let worktree_content = worktree_file_content(&worktree_path)?;
  let (original_label, modified_label, original_content, modified_content) =
    match section.unwrap_or("unstaged") {
      "staged" => (
        "HEAD",
        "Index",
        head_content,
        index_content.unwrap_or_default(),
      ),
      "untracked" => ("Empty", "Working Tree", String::new(), worktree_content),
      "conflicts" => ("HEAD", "Working Tree", head_content, worktree_content),
      _ => (
        "Index",
        "Working Tree",
        index_content.unwrap_or(head_content),
        worktree_content,
      ),
    };

  let unified_diff = unified_diff(
    &safe_path.to_string_lossy(),
    original_label,
    modified_label,
    &original_content,
    &modified_content,
  );

  Ok(GitFileDiff {
    path: safe_path.to_string_lossy().to_string(),
    old_path: None,
    original_label: original_label.to_string(),
    modified_label: modified_label.to_string(),
    original_content,
    modified_content,
    unified_diff,
  })
}

fn empty_repo_info() -> GitRepoInfo {
  GitRepoInfo {
    is_repository: false,
    workdir: None,
    git_dir: None,
    branch: None,
    head: None,
  }
}

fn repo_info(repo: &gix::Repository) -> GitRepoInfo {
  let branch = repo
    .head_name()
    .ok()
    .flatten()
    .map(|name| name.shorten().to_str_lossy().into_owned());
  let head = repo.head_id().ok().map(|id| id.to_string());

  GitRepoInfo {
    is_repository: true,
    workdir: repo.workdir().map(path_to_string),
    git_dir: Some(path_to_string(repo.git_dir())),
    branch,
    head,
  }
}

fn head_blob_content(repo: &gix::Repository, relative_path: &Path) -> Result<String, String> {
  let tree = match repo.rev_parse_single("HEAD") {
    Ok(head) => head
      .object()
      .map_err(|err| format!("Failed to read HEAD object: {err}"))?
      .peel_to_tree()
      .map_err(|err| format!("Failed to read HEAD tree: {err}"))?,
    Err(_) => return Ok(String::new()),
  };

  let entry = tree
    .lookup_entry_by_path(relative_path)
    .map_err(|err| format!("Failed to find file in HEAD: {err}"))?;
  let Some(entry) = entry else {
    return Ok(String::new());
  };

  let blob = entry
    .object()
    .map_err(|err| format!("Failed to read HEAD entry: {err}"))?
    .try_into_blob()
    .map_err(|err| format!("HEAD entry is not a blob: {err}"))?;
  Ok(bytes_to_string(&blob.data))
}

fn index_blob_content(
  repo: &gix::Repository,
  relative_path: &Path,
) -> Result<Option<String>, String> {
  let index = repo
    .index_or_empty()
    .map_err(|err| format!("Failed to read git index: {err}"))?;
  let path = repo_relative_bstr(relative_path)?;
  let Some(entry) = index.entry_by_path(path.as_ref()) else {
    return Ok(None);
  };
  let blob = repo
    .find_blob(entry.id)
    .map_err(|err| format!("Failed to read index blob: {err}"))?;
  Ok(Some(bytes_to_string(&blob.data)))
}

fn worktree_file_content(path: &Path) -> Result<String, String> {
  match std::fs::read(path) {
    Ok(bytes) => Ok(bytes_to_string(&bytes)),
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
    Err(err) => Err(format!(
      "Failed to read worktree file {}: {err}",
      path.display()
    )),
  }
}

fn staged_change(change: gix::diff::index::Change) -> GitFileChange {
  match change {
    gix::diff::index::Change::Addition { location, .. } => GitFileChange {
      path: bstr_to_string(location.as_ref()),
      old_path: None,
      status: "added".to_string(),
      detail: "index".to_string(),
    },
    gix::diff::index::Change::Deletion { location, .. } => GitFileChange {
      path: bstr_to_string(location.as_ref()),
      old_path: None,
      status: "deleted".to_string(),
      detail: "index".to_string(),
    },
    gix::diff::index::Change::Modification { location, .. } => GitFileChange {
      path: bstr_to_string(location.as_ref()),
      old_path: None,
      status: "modified".to_string(),
      detail: "index".to_string(),
    },
    gix::diff::index::Change::Rewrite {
      source_location,
      location,
      copy,
      ..
    } => GitFileChange {
      path: bstr_to_string(location.as_ref()),
      old_path: Some(bstr_to_string(source_location.as_ref())),
      status: if copy { "copied" } else { "renamed" }.to_string(),
      detail: "index".to_string(),
    },
  }
}

fn worktree_change(change: gix::status::index_worktree::Item) -> GitFileChange {
  match change {
    gix::status::index_worktree::Item::Modification {
      rela_path, status, ..
    } => {
      let status_text = format!("{status:?}");
      GitFileChange {
        path: bstr_to_string(rela_path.as_ref()),
        old_path: None,
        status: worktree_status_kind(&status_text).to_string(),
        detail: status_text,
      }
    }
    gix::status::index_worktree::Item::DirectoryContents { entry, .. } => GitFileChange {
      path: bstr_to_string(entry.rela_path.as_ref()),
      old_path: None,
      status: dir_status_kind(entry.status).to_string(),
      detail: format!("{:?}", entry.disk_kind),
    },
    gix::status::index_worktree::Item::Rewrite {
      source,
      dirwalk_entry,
      copy,
      ..
    } => GitFileChange {
      path: bstr_to_string(dirwalk_entry.rela_path.as_ref()),
      old_path: Some(rewrite_source_path(source)),
      status: if copy { "copied" } else { "renamed" }.to_string(),
      detail: "worktree".to_string(),
    },
  }
}

fn rewrite_source_path(source: gix::status::index_worktree::RewriteSource) -> String {
  match source {
    gix::status::index_worktree::RewriteSource::RewriteFromIndex {
      source_rela_path, ..
    } => bstr_to_string(source_rela_path.as_ref()),
    gix::status::index_worktree::RewriteSource::CopyFromDirectoryEntry {
      source_dirwalk_entry,
      ..
    } => bstr_to_string(source_dirwalk_entry.rela_path.as_ref()),
  }
}

fn worktree_status_kind(detail: &str) -> &'static str {
  if detail.contains("Conflict") {
    "conflicted"
  } else if detail.contains("Removed") {
    "deleted"
  } else if detail.contains("Type") {
    "modified"
  } else if detail.contains("Modification") || detail.contains("SubmoduleModification") {
    "modified"
  } else {
    "modified"
  }
}

fn dir_status_kind(status: gix::dir::entry::Status) -> &'static str {
  match status {
    gix::dir::entry::Status::Pruned => "pruned",
    gix::dir::entry::Status::Tracked => "tracked",
    gix::dir::entry::Status::Ignored(_) => "ignored",
    gix::dir::entry::Status::Untracked => "untracked",
  }
}

fn path_to_string(path: &Path) -> String {
  path.to_string_lossy().to_string()
}

fn bstr_to_string(value: &gix::bstr::BStr) -> String {
  value.to_str_lossy().into_owned()
}

fn bytes_to_string(bytes: &[u8]) -> String {
  String::from_utf8_lossy(bytes).into_owned()
}

fn unified_diff(
  path: &str,
  original_label: &str,
  modified_label: &str,
  original_content: &str,
  modified_content: &str,
) -> String {
  TextDiff::from_lines(original_content, modified_content)
    .unified_diff()
    .header(
      &format!("{original_label}/{path}"),
      &format!("{modified_label}/{path}"),
    )
    .to_string()
}

fn repo_relative_bstr(path: &Path) -> Result<gix::bstr::BString, String> {
  let value = path
    .to_str()
    .ok_or_else(|| format!("Git path is not valid UTF-8: {}", path.display()))?
    .replace('\\', "/");
  Ok(value.into())
}

fn normalize_repo_relative_path(relative_path: &str) -> Result<PathBuf, String> {
  let path = PathBuf::from(relative_path).clean();
  if path.is_absolute() {
    return Err("Git path must be repository-relative".to_string());
  }

  let mut safe = PathBuf::new();
  for component in path.components() {
    match component {
      std::path::Component::Normal(value) => safe.push(value),
      std::path::Component::CurDir => {}
      std::path::Component::ParentDir
      | std::path::Component::RootDir
      | std::path::Component::Prefix(_) => {
        return Err(format!("Invalid git path: {relative_path}"))
      }
    }
  }

  if safe.as_os_str().is_empty() {
    return Err("Git path cannot be empty".to_string());
  }

  Ok(safe)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn initializes_and_discovers_repository() {
    let root = std::env::temp_dir().join(format!(
      "marko-git-service-{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("time should move forward")
        .as_nanos()
    ));
    std::fs::create_dir_all(&root).expect("temp dir should be created");

    let service = GitService;
    let before = service
      .discover(root.to_string_lossy().to_string())
      .await
      .expect("discover should not fail for a normal directory");
    assert!(!before.is_repository);

    let after = service
      .init(root.to_string_lossy().to_string())
      .await
      .expect("init should create repository");
    assert!(after.is_repository);
    assert_eq!(after.branch.as_deref(), Some("main"));

    let snapshot = service
      .status(root.to_string_lossy().to_string())
      .await
      .expect("status should work for new repository");
    assert!(snapshot.repo.is_repository);

    std::fs::write(root.join("note.md"), "# Note\n").expect("worktree file should be written");
    let diff = service
      .file_diff(
        root.to_string_lossy().to_string(),
        "note.md".to_string(),
        Some("untracked".to_string()),
      )
      .await
      .expect("diff should work for untracked file");
    assert_eq!(diff.original_content, "");
    assert_eq!(diff.modified_content, "# Note\n");
    assert_eq!(diff.original_label, "Empty");
    assert_eq!(diff.modified_label, "Working Tree");
    assert!(diff.unified_diff.contains("+# Note"));

    let _ = std::fs::remove_dir_all(root);
  }
}
