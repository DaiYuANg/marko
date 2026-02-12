import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import { buildFileTree } from '@/logic/fileTree'
import { buildRouteMaps } from '@/logic/routing'
import { useProjectLoader } from '@/app/useProjectLoader'
import { useEditorBuffer } from '@/app/useEditorBuffer'
import { useGraphData } from '@/app/useGraphData'

export function useAppLayoutState() {
  type FsSnapshot = {
    root: {
      kind: 'internal' | 'external'
      path: string
    }
    entries: Array<{
      path: string
      kind: 'file' | 'folder'
    }>
  }

  const {
    rootPath,
    rootKind,
    recentProjects,
    entries,
    tabs,
    activePath,
    sidebarCollapsed,
    rightSidebarCollapsed,
    theme,
    setRootPath,
    setRootKind,
    setEntries,
    setTabs,
    setActivePath,
    toggleSidebar,
    toggleRightSidebar,
    setTheme,
    touchRecentProject,
  } = useAppStore()

  const [isMaximized, setIsMaximized] = useState(false)

  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()

  const routeMaps = useMemo(() => buildRouteMaps(entries), [entries])

  const workspaceKey = `${rootKind}:${rootPath}`
  const { fileContents, setFileContents, editorValue, onEditorChange } = useEditorBuffer({
    activePath,
    workspaceKey,
  })

  const {
    loadWorkspace,
    onSelectFolder,
    onUseInternalRoot,
    openFolder,
    createFile,
    createFolder,
    renamePath,
    deletePath,
  } = useProjectLoader({
    tabs,
    activePath,
    locationPathname: location.pathname,
    navigate,
    setEntries,
    setFileContents,
    setRootPath,
    setRootKind,
    setTabs,
    setActivePath,
    touchRecentProject,
  })

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    const setup = async () => {
      const { listen } = await import('@tauri-apps/api/event')
      unlisten = await listen<FsSnapshot>('fs-changed', (event) => {
        void loadWorkspace({
          snapshot: event.payload,
          refreshContents: 'none',
        })
      })
    }
    if (typeof window !== 'undefined') {
      void setup()
    }
    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [loadWorkspace])

  useEffect(() => {
    const slug = params.slug
    if (!slug || location.pathname.includes('graph')) return
    const match = routeMaps.slugToPath.get(slug)
    if (match && match !== activePath) {
      setActivePath(match)
    }
  }, [activePath, location.pathname, params.slug, routeMaps, setActivePath])

  const onOpenFile = useCallback(
    (relativePath: string) => {
      const nextTabs = tabs.includes(relativePath) ? tabs : [...tabs, relativePath]
      setTabs(nextTabs)
      const nextSlug = routeMaps.pathToSlug.get(relativePath) ?? relativePath
      if (location.pathname !== `/${nextSlug}`) {
        navigate(`/${nextSlug}`)
      }
    },
    [location.pathname, navigate, routeMaps, setTabs, tabs],
  )

  const onCloseTab = useCallback(
    (relativePath: string) => {
      const nextTabs = tabs.filter((tab) => tab !== relativePath)
      setTabs(nextTabs)
      if (activePath === relativePath) {
        const nextActive = nextTabs[0] ?? null
        if (nextActive) {
          const nextSlug = routeMaps.pathToSlug.get(nextActive) ?? nextActive
          if (location.pathname !== `/${nextSlug}`) {
            navigate(`/${nextSlug}`)
          }
        }
      }
    },
    [activePath, location.pathname, navigate, routeMaps, setTabs, tabs],
  )

  const fileTree = useMemo(() => buildFileTree(entries), [entries])
  const graph = useGraphData(entries, fileContents, location.pathname)

  return {
    recentProjects,
    files: entries,
    tabs,
    activePath,
    sidebarCollapsed,
    rightSidebarCollapsed,
    theme,
    routeMaps,
    fileTree,
    graph,
    editorValue,
    isMaximized,
    setIsMaximized,
    onEditorChange,
    onOpenFile,
    onCloseTab,
    onSelectProject: onSelectFolder,
    onOpenProject: openFolder,
    onUseInternalRoot,
    createFile,
    createFolder,
    renamePath,
    deletePath,
    onRefresh: loadWorkspace,
    setTheme,
    toggleSidebar,
    toggleRightSidebar,
  }
}
