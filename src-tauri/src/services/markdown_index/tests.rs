use crate::models::FsEntry;

use super::build_workspace_index;

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
      "# Current\nSee [Target](target.md#Details) and [[today]].\n![Logo](../assets/logo.png)\n"
        .to_string(),
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
  assert_eq!(current.assets[0].target, "../assets/logo.png");
  assert_eq!(
    current.assets[0].target_path.as_deref(),
    Some("assets/logo.png")
  );
  assert_eq!(current.assets[0].media_type.as_deref(), Some("image/png"));
}
