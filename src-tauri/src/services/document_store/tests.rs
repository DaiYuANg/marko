use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::FsEntry;
use crate::state::{FsState, FsStateData};

use super::DocumentStoreService;

fn temp_root() -> PathBuf {
  std::env::temp_dir().join(format!(
    "marko-document-store-test-{}",
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("time should be valid")
      .as_nanos()
  ))
}

fn test_state(root: &Path) -> FsState {
  FsState(RwLock::new(FsStateData {
    root_kind: "external".to_string(),
    root_path: root.to_path_buf(),
    internal_root: root.to_path_buf(),
    single_file: None,
  }))
}

#[tokio::test]
async fn reads_updates_and_flushes_documents() {
  let root = temp_root();
  fs::create_dir_all(&root).expect("test root should be created");
  fs::write(root.join("note.md"), "from disk").expect("test file should be written");

  let store = DocumentStoreService::default();
  let state = test_state(&root);

  let initial = store
    .read_document(&state, "note.md")
    .await
    .expect("document should load");
  assert_eq!(initial, "from disk");

  let dirty = store
    .update_document(&state, "note.md", "from memory")
    .expect("document should update");
  assert!(dirty.dirty);

  let statuses = store
    .flush_all_with_status_async(&state)
    .await
    .expect("documents should flush");
  assert_eq!(statuses.len(), 1);
  assert!(!statuses[0].dirty);
  assert_eq!(
    fs::read_to_string(root.join("note.md")).expect("file should be readable"),
    "from memory"
  );
}

#[test]
fn renames_cached_document_paths() {
  let store = DocumentStoreService::default();
  store
    .insert_clean("docs/a.md", "content")
    .expect("document should cache");

  store
    .rename_path("docs", "notes")
    .expect("document path should rename");

  assert!(store
    .cached_content("docs/a.md")
    .expect("cache should read")
    .is_none());
  assert_eq!(
    store
      .cached_content("notes/a.md")
      .expect("cache should read"),
    Some("content".to_string())
  );
}

#[test]
fn cloned_store_handles_share_document_state() {
  let store = DocumentStoreService::default();
  let cloned = store.clone();

  store
    .insert_clean("shared.md", "content")
    .expect("document should cache");

  assert_eq!(
    cloned
      .cached_content("shared.md")
      .expect("cache should read from clone"),
    Some("content".to_string())
  );
}

#[tokio::test]
async fn snapshots_include_content_hash() {
  let root = temp_root();
  fs::create_dir_all(&root).expect("test root should be created");
  fs::write(root.join("note.md"), "hello").expect("test file should be written");

  let store = DocumentStoreService::default();
  let state = test_state(&root);
  let data = state.0.read().expect("state should lock").clone();
  let files = vec![FsEntry {
    path: "note.md".to_string(),
    name: "note.md".to_string(),
    kind: "file".to_string(),
  }];

  let snapshots = store
    .document_snapshots_for_files(&data, &files)
    .await
    .expect("snapshots should load");
  assert_eq!(snapshots[0].content, "hello");
  let initial_hash = snapshots[0].content_hash;

  store
    .update_document(&state, "note.md", "updated")
    .expect("document should update");
  let snapshots = store
    .document_snapshots_for_files(&data, &files)
    .await
    .expect("snapshots should load");
  assert_eq!(snapshots[0].content, "updated");
  assert_ne!(snapshots[0].content_hash, initial_hash);
}

#[test]
fn clears_clean_documents_and_keeps_dirty_documents() {
  let root = temp_root();
  fs::create_dir_all(&root).expect("test root should be created");

  let store = DocumentStoreService::default();
  let state = test_state(&root);
  store
    .insert_clean("clean.md", "clean")
    .expect("clean document should cache");
  store
    .update_document(&state, "dirty.md", "dirty")
    .expect("dirty document should update");

  store.clear_clean().expect("clean documents should clear");

  assert!(store
    .cached_content("clean.md")
    .expect("cache should read")
    .is_none());
  assert_eq!(
    store.cached_content("dirty.md").expect("cache should read"),
    Some("dirty".to_string())
  );
}

#[test]
fn invalidates_clean_documents_for_changed_absolute_paths() {
  let root = temp_root();
  fs::create_dir_all(root.join("docs")).expect("test root should be created");

  let store = DocumentStoreService::default();
  let state = test_state(&root);
  store
    .insert_clean("docs/clean.md", "clean")
    .expect("clean document should cache");
  store
    .update_document(&state, "docs/dirty.md", "dirty")
    .expect("dirty document should update");

  let removed = store
    .invalidate_clean_absolute_paths(&state, &[root.join("docs")])
    .expect("changed paths should invalidate");

  assert_eq!(removed, 1);
  assert!(store
    .cached_content("docs/clean.md")
    .expect("cache should read")
    .is_none());
  assert_eq!(
    store
      .cached_content("docs/dirty.md")
      .expect("cache should read"),
    Some("dirty".to_string())
  );
}

#[test]
fn parsed_markdown_cache_tracks_content_hash_changes() {
  let root = temp_root();
  fs::create_dir_all(&root).expect("test root should be created");

  let store = DocumentStoreService::default();
  let state = test_state(&root);
  store
    .insert_clean("note.md", "# One")
    .expect("document should cache");
  let snapshot = store
    .cached_snapshot("note.md")
    .expect("snapshot should read")
    .expect("snapshot should exist");
  let parsed = store
    .parsed_markdown_documents_for_snapshots(&[snapshot])
    .expect("markdown should parse");
  assert_eq!(parsed[0].headings[0].text, "One");

  store
    .update_document(&state, "note.md", "# Two")
    .expect("document should update");
  let snapshot = store
    .cached_snapshot("note.md")
    .expect("snapshot should read")
    .expect("snapshot should exist");
  let parsed = store
    .parsed_markdown_documents_for_snapshots(&[snapshot])
    .expect("markdown should parse");
  assert_eq!(parsed[0].headings[0].text, "Two");
}
