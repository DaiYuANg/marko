import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'

export const fsRootInfoSchema = z.object({
  kind: z.enum(['internal', 'external', 'single']),
  path: z.string(),
})

export const fsEntrySchema = z.object({
  path: z.string(),
  kind: z.enum(['file', 'folder']),
  name: z.string().optional(),
})

export const fsSnapshotSchema = z.object({
  root: fsRootInfoSchema,
  entries: z.array(fsEntrySchema),
})

export const fsPathMetadataSchema = z.object({
  path: z.string(),
  absolute_path: z.string(),
  kind: z.enum(['file', 'folder']),
  size_bytes: z.number(),
  modified_ms: z.number().optional(),
  readonly: z.boolean(),
})

export const fsBufferStatusSchema = z.object({
  path: z.string(),
  revision: z.number(),
  dirty: z.boolean(),
})

export const fsMarkdownHeadingSchema = z.object({
  path: z.string(),
  level: z.number(),
  text: z.string(),
  slug: z.string(),
  line: z.number(),
})

export const fsMarkdownLinkSchema = z.object({
  source_path: z.string(),
  text: z.string(),
  target: z.string(),
  link_type: z.enum(['markdown', 'wiki']),
  target_path: z.string().nullable().optional(),
  target_anchor: z.string().nullable().optional(),
  target_heading_slug: z.string().nullable().optional(),
  is_external: z.boolean(),
  context: z.string(),
  line: z.number(),
  column: z.number(),
})

export const fsIndexedMarkdownFileSchema = z.object({
  path: z.string(),
  headings: z.array(fsMarkdownHeadingSchema),
  links: z.array(fsMarkdownLinkSchema),
})

export const fsWorkspaceIndexSchema = z.object({
  files: z.array(fsIndexedMarkdownFileSchema),
})

export const fsGraphNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(['file', 'heading', 'missing', 'external']),
  label: z.string(),
  path: z.string().nullable().optional(),
  line: z.number().nullable().optional(),
  level: z.number().nullable().optional(),
  slug: z.string().nullable().optional(),
})

export const fsGraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: z.enum(['contains', 'links_to', 'references_heading']),
})

export const fsGraphSchema = z.object({
  mode: z.enum(['outline', 'mindmap']),
  nodes: z.array(fsGraphNodeSchema),
  edges: z.array(fsGraphEdgeSchema),
})

export type FsRootKind = z.infer<typeof fsRootInfoSchema>['kind']
export type FsEntry = z.infer<typeof fsEntrySchema>
export type FsRootInfo = z.infer<typeof fsRootInfoSchema>
export type FsSnapshot = z.infer<typeof fsSnapshotSchema>
export type FsPathMetadata = z.infer<typeof fsPathMetadataSchema>
export type FsBufferStatus = z.infer<typeof fsBufferStatusSchema>
export type FsMarkdownHeading = z.infer<typeof fsMarkdownHeadingSchema>
export type FsMarkdownLink = z.infer<typeof fsMarkdownLinkSchema>
export type FsIndexedMarkdownFile = z.infer<typeof fsIndexedMarkdownFileSchema>
export type FsWorkspaceIndex = z.infer<typeof fsWorkspaceIndexSchema>
export type FsGraphNode = z.infer<typeof fsGraphNodeSchema>
export type FsGraphEdge = z.infer<typeof fsGraphEdgeSchema>
export type FsGraph = z.infer<typeof fsGraphSchema>

export const fsApi = {
  async getSnapshot() {
    const result = await invoke<unknown>('fs_get_snapshot')
    return fsSnapshotSchema.parse(result)
  },
  async setRoot(path: string | null) {
    const result = await invoke<unknown>('fs_set_root', { path })
    return fsRootInfoSchema.parse(result)
  },
  async setSingleFile(path: string) {
    const result = await invoke<unknown>('fs_set_single_file', { path })
    return fsRootInfoSchema.parse(result)
  },
  openFile(path: string) {
    return invoke<string>('fs_open_file', { path })
  },
  readFile(path: string) {
    return invoke<string>('fs_read_file', { path })
  },
  async getWorkspaceIndex() {
    const result = await invoke<unknown>('fs_get_workspace_index')
    return fsWorkspaceIndexSchema.parse(result)
  },
  async getWorkspaceGraph() {
    const result = await invoke<unknown>('fs_get_workspace_graph')
    return fsGraphSchema.parse(result)
  },
  async getOutlineGraph(path: string) {
    const result = await invoke<unknown>('fs_get_outline_graph', { path })
    return fsGraphSchema.parse(result)
  },
  async updateBuffer(path: string, content: string) {
    const result = await invoke<unknown>('fs_update_buffer', { path, content })
    return fsBufferStatusSchema.parse(result)
  },
  flushBuffers() {
    return invoke<number>('fs_flush_buffers')
  },
  async getBufferStatus(path: string) {
    const result = await invoke<unknown>('fs_get_buffer_status', { path })
    return result == null ? null : fsBufferStatusSchema.parse(result)
  },
  createFile(path: string) {
    return invoke('fs_create_file', { path })
  },
  createDir(path: string) {
    return invoke('fs_create_dir', { path })
  },
  renamePath(from: string, to: string) {
    return invoke('fs_rename_path', { from, to })
  },
  deletePath(path: string) {
    return invoke('fs_delete_path', { path })
  },
  async getPathMetadata(path: string) {
    const result = await invoke<unknown>('fs_get_path_metadata', { path })
    return fsPathMetadataSchema.parse(result)
  },
}
