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

export type FsRootKind = z.infer<typeof fsRootInfoSchema>['kind']
export type FsEntry = z.infer<typeof fsEntrySchema>
export type FsRootInfo = z.infer<typeof fsRootInfoSchema>
export type FsSnapshot = z.infer<typeof fsSnapshotSchema>
export type FsPathMetadata = z.infer<typeof fsPathMetadataSchema>
export type FsBufferStatus = z.infer<typeof fsBufferStatusSchema>

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
