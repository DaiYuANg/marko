import { useCallback } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { NavigateFunction } from 'react-router-dom'
import type { FileEntry } from '@/store/useAppStore'
import { buildRouteMaps } from '@/logic/routing'
import { useI18n } from '@/i18n/useI18n'

type UseProjectLoaderArgs = {
  tabs: string[]
  activePath: string | null
  locationPathname: string
  navigate: NavigateFunction
  setEntries: (entries: FileEntry[]) => void
  setFileContents: (files: Record<string, string>) => void
  setRootPath: (path: string) => void
  setRootKind: (kind: 'internal' | 'external') => void
  setTabs: (tabs: string[]) => void
  setActivePath: (path: string | null) => void
  touchRecentProject: (path: string) => void
}

type FsRootInfo = {
  kind: 'internal' | 'external'
  path: string
}

type FsSnapshot = {
  root: FsRootInfo
  entries: FileEntry[]
}

type LoadWorkspaceOptions = {
  snapshot?: FsSnapshot
  refreshContents?: 'all' | 'none'
}

function isFile(entry: FileEntry) {
  return entry.kind === 'file'
}

async function fetchSnapshot() {
  return invoke<FsSnapshot>('fs_get_snapshot')
}

export function useProjectLoader({
  tabs,
  activePath,
  locationPathname,
  navigate,
  setEntries,
  setFileContents,
  setRootPath,
  setRootKind,
  setTabs,
  setActivePath,
  touchRecentProject,
}: UseProjectLoaderArgs) {
  const { t } = useI18n()

  const loadWorkspace = useCallback(
    async (options?: LoadWorkspaceOptions) => {
      if (!isTauri()) return
      const snapshot = options?.snapshot ?? (await fetchSnapshot())
      const refreshContents = options?.refreshContents ?? 'all'
      const rootInfo = snapshot.root
      setRootPath(rootInfo.path)
      setRootKind(rootInfo.kind)

      let nextEntries = snapshot.entries
      if (!nextEntries.some(isFile)) {
        const fallbackName = 'Untitled.md'
        await invoke('fs_create_file', { path: fallbackName })
        const refreshed = await fetchSnapshot()
        nextEntries = refreshed.entries
        setRootPath(refreshed.root.path)
        setRootKind(refreshed.root.kind)
      }

      setEntries(nextEntries)
      const filesOnly = nextEntries.filter(isFile)
      if (refreshContents === 'all') {
        const contentsEntries = await Promise.all(
          filesOnly.map(async (file) => {
            const content = await invoke<string>('fs_read_file', { path: file.path })
            return [file.path, content] as const
          }),
        )
        const nextContents: Record<string, string> = {}
        contentsEntries.forEach(([relative, content]) => {
          nextContents[relative] = content
        })
        setFileContents(nextContents)
      }

      if (filesOnly.length > 0) {
        const available = new Set(filesOnly.map((file) => file.path))
        const defaultPath = filesOnly[0].path
        const nextTabs = tabs.filter((tab) => available.has(tab))
        const finalTabs = nextTabs.length > 0 ? nextTabs : [defaultPath]
        setTabs(finalTabs)
        const nextActive = activePath && available.has(activePath) ? activePath : defaultPath
        setActivePath(nextActive)
        const nextRouteMaps = buildRouteMaps(nextEntries)
        const nextSlug = nextRouteMaps.pathToSlug.get(nextActive) ?? nextActive
        if (locationPathname !== `/${nextSlug}`) {
          navigate(`/${nextSlug}`, { replace: true })
        }
      }
    },
    [
      activePath,
      locationPathname,
      navigate,
      setActivePath,
      setEntries,
      setFileContents,
      setRootKind,
      setRootPath,
      setTabs,
      tabs,
    ],
  )

  const openFolder = useCallback(
    async (path: string) => {
      if (!isTauri()) return
      await invoke('fs_set_root', { path })
      touchRecentProject(path)
    },
    [touchRecentProject],
  )

  const onSelectFolder = useCallback(async () => {
    if (!isTauri()) return
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('dialog.selectProjectTitle'),
    })
    if (typeof selected === 'string') {
      await openFolder(selected)
    }
  }, [openFolder, t])

  const onUseInternalRoot = useCallback(async () => {
    if (!isTauri()) return
    await invoke('fs_set_root', { path: null })
  }, [])

  const createFile = useCallback(async (path: string) => {
    if (!isTauri()) return
    const normalized = path.endsWith('.md') || path.endsWith('.markdown') ? path : `${path}.md`
    await invoke('fs_create_file', { path: normalized })
  }, [])

  const createFolder = useCallback(async (path: string) => {
    if (!isTauri()) return
    await invoke('fs_create_dir', { path })
  }, [])

  const renamePath = useCallback(async (from: string, to: string) => {
    if (!isTauri()) return
    await invoke('fs_rename_path', { from, to })
  }, [])

  const deletePath = useCallback(async (path: string) => {
    if (!isTauri()) return
    await invoke('fs_delete_path', { path })
  }, [])

  return {
    loadWorkspace,
    onSelectFolder,
    onUseInternalRoot,
    openFolder,
    createFile,
    createFolder,
    renamePath,
    deletePath,
  }
}
