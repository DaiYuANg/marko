import { useCallback, useEffect, useRef } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { NavigateFunction } from 'react-router-dom'
import type { FileEntry } from '@/store/useAppStore'
import { pathToRoute } from '@/logic/routing'
import { useI18n } from '@/i18n/useI18n'

type UseProjectLoaderArgs = {
  rootPath: string
  rootKind: 'internal' | 'external' | 'single'
  entries: FileEntry[]
  tabs: string[]
  activePath: string | null
  locationPathname: string
  navigate: NavigateFunction
  setEntries: (entries: FileEntry[]) => void
  setRootPath: (path: string) => void
  setRootKind: (kind: 'internal' | 'external' | 'single') => void
  setTabs: (tabs: string[]) => void
  setActivePath: (path: string | null) => void
  touchRecentProject: (path: string) => void
}

type FsRootInfo = {
  kind: 'internal' | 'external' | 'single'
  path: string
}

type FsSnapshot = {
  root: FsRootInfo
  entries: FileEntry[]
}

type LoadWorkspaceOptions = {
  snapshot?: FsSnapshot
}

function isFile(entry: FileEntry) {
  return entry.kind === 'file'
}

function arePathListsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function areEntriesEqual(left: FileEntry[], right: FileEntry[]) {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index].path !== right[index].path) return false
    if (left[index].kind !== right[index].kind) return false
  }
  return true
}

async function fetchSnapshot() {
  return invoke<FsSnapshot>('fs_get_snapshot')
}

export function useProjectLoader({
  rootPath,
  rootKind,
  entries,
  tabs,
  activePath,
  locationPathname,
  navigate,
  setEntries,
  setRootPath,
  setRootKind,
  setTabs,
  setActivePath,
  touchRecentProject,
}: UseProjectLoaderArgs) {
  const { t } = useI18n()
  const entriesRef = useRef(entries)
  const tabsRef = useRef(tabs)
  const activePathRef = useRef(activePath)
  const rootPathRef = useRef(rootPath)
  const rootKindRef = useRef(rootKind)
  const locationPathnameRef = useRef(locationPathname)

  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    activePathRef.current = activePath
  }, [activePath])

  useEffect(() => {
    rootPathRef.current = rootPath
  }, [rootPath])

  useEffect(() => {
    rootKindRef.current = rootKind
  }, [rootKind])

  useEffect(() => {
    locationPathnameRef.current = locationPathname
  }, [locationPathname])

  const loadWorkspace = useCallback(
    async (options?: LoadWorkspaceOptions) => {
      if (!isTauri()) return
      const snapshot = options?.snapshot ?? (await fetchSnapshot())
      const rootInfo = snapshot.root
      if (rootPathRef.current !== rootInfo.path) {
        setRootPath(rootInfo.path)
        rootPathRef.current = rootInfo.path
      }
      if (rootKindRef.current !== rootInfo.kind) {
        setRootKind(rootInfo.kind)
        rootKindRef.current = rootInfo.kind
      }

      let nextEntries = snapshot.entries
      if (rootInfo.kind !== 'single' && !nextEntries.some(isFile)) {
        const fallbackName = 'Untitled.md'
        await invoke('fs_create_file', { path: fallbackName })
        const refreshed = await fetchSnapshot()
        nextEntries = refreshed.entries
        if (rootPathRef.current !== refreshed.root.path) {
          setRootPath(refreshed.root.path)
          rootPathRef.current = refreshed.root.path
        }
        if (rootKindRef.current !== refreshed.root.kind) {
          setRootKind(refreshed.root.kind)
          rootKindRef.current = refreshed.root.kind
        }
      }

      if (!areEntriesEqual(entriesRef.current, nextEntries)) {
        setEntries(nextEntries)
        entriesRef.current = nextEntries
      }
      const filesOnly = nextEntries.filter(isFile)

      if (filesOnly.length > 0) {
        const available = new Set(filesOnly.map((file) => file.path))
        const defaultPath = filesOnly[0].path
        const nextTabs = tabsRef.current.filter((tab) => available.has(tab))
        const finalTabs = nextTabs.length > 0 ? nextTabs : [defaultPath]
        if (!arePathListsEqual(tabsRef.current, finalTabs)) {
          setTabs(finalTabs)
          tabsRef.current = finalTabs
        }
        const currentActivePath = activePathRef.current
        const nextActive = currentActivePath && available.has(currentActivePath) ? currentActivePath : defaultPath
        if (nextActive !== currentActivePath) {
          setActivePath(nextActive)
          activePathRef.current = nextActive
        }
        const nextRoute = pathToRoute(nextActive)
        if (locationPathnameRef.current !== nextRoute) {
          navigate(nextRoute, { replace: true })
        }
      }
    },
    [
      navigate,
      setActivePath,
      setEntries,
      setRootKind,
      setRootPath,
      setTabs,
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

  const onSelectSingleFile = useCallback(async () => {
    if (!isTauri()) return
    const selected = await open({
      directory: false,
      multiple: false,
      title: t('dialog.selectFileTitle'),
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    if (typeof selected === 'string') {
      await invoke('fs_set_single_file', { path: selected })
      touchRecentProject(selected)
    }
  }, [t, touchRecentProject])

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
    onSelectSingleFile,
    onUseInternalRoot,
    openFolder,
    createFile,
    createFolder,
    renamePath,
    deletePath,
  }
}
