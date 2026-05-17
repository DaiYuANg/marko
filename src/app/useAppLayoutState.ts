import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLatest } from 'ahooks'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAppStore, type ViewMode } from '@/store/useAppStore'
import { buildFileTree } from '@/logic/fileTree'
import { pathToRoute, routeToPath } from '@/logic/routing'
import { useProjectLoader } from '@/app/useProjectLoader'
import { useEditorBuffer } from '@/app/useEditorBuffer'
import { useGraphData } from '@/app/useGraphData'
import { fsSnapshotSchema } from '@/services/fsApi'
import { useWorkspaceIndex } from '@/app/useWorkspaceIndex'

export function useAppLayoutState() {
  const rootPath = useAppStore((s) => s.rootPath)
  const rootKind = useAppStore((s) => s.rootKind)
  const recentProjects = useAppStore((s) => s.recentProjects)
  const entries = useAppStore((s) => s.entries)
  const tabs = useAppStore((s) => s.tabs)
  const activePath = useAppStore((s) => s.activePath)
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed)
  const rightSidebarCollapsed = useAppStore((s) => s.rightSidebarCollapsed)
  const theme = useAppStore((s) => s.theme)
  const silentSave = useAppStore((s) => s.silentSave)
  const showEditorStatusBar = useAppStore((s) => s.showEditorStatusBar)

  const setRootPath = useAppStore((s) => s.setRootPath)
  const setRootKind = useAppStore((s) => s.setRootKind)
  const setEntries = useAppStore((s) => s.setEntries)
  const setTabs = useAppStore((s) => s.setTabs)
  const setActivePath = useAppStore((s) => s.setActivePath)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const toggleRightSidebar = useAppStore((s) => s.toggleRightSidebar)
  const setTheme = useAppStore((s) => s.setTheme)
  const touchRecentProject = useAppStore((s) => s.touchRecentProject)

  const [isMaximized, setIsMaximized] = useState(false)
  const [tabViewModes, setTabViewModes] = useState<Record<string, ViewMode>>({})
  const [inspectedPath, setInspectedPath] = useState<string | null>(null)

  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()

  const routeSegment = params['*']
  const routePath = useMemo(() => routeToPath(routeSegment), [routeSegment])
  const isRouteFile = useMemo(
    () =>
      routePath !== null &&
      entries.some((entry) => entry.kind === 'file' && entry.path === routePath),
    [entries, routePath],
  )
  const currentPath = isRouteFile ? routePath : activePath
  const activePathRef = useLatest(activePath)
  const currentPathRef = useLatest(currentPath)
  const inspectedPathRef = useLatest(inspectedPath)
  const locationPathnameRef = useLatest(location.pathname)
  const tabsRef = useLatest(tabs)
  const viewMode: ViewMode = currentPath ? (tabViewModes[currentPath] ?? 'wysiwyg') : 'wysiwyg'
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      const path = currentPathRef.current
      if (!path) return
      setTabViewModes((prev) => ({ ...prev, [path]: mode }))
    },
    [currentPathRef],
  )

  const workspaceKey = `${rootKind}:${rootPath}`
  const { fileContents, editorValue, dirtyPaths, saveStates, onEditorChange } = useEditorBuffer({
    activePath: currentPath,
    workspaceKey,
  })

  const {
    loadWorkspace,
    onSelectFolder,
    onSelectSingleFile,
    onUseInternalRoot,
    openFolder,
    createFile,
    createFolder,
    renamePath,
    deletePath,
  } = useProjectLoader({
    rootPath,
    rootKind,
    entries,
    tabs,
    activePath: currentPath,
    locationPathname: location.pathname,
    navigate,
    setEntries,
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
      unlisten = await listen<unknown>('fs-changed', (event) => {
        const parsed = fsSnapshotSchema.safeParse(event.payload)
        if (!parsed.success) return
        void loadWorkspace({
          snapshot: parsed.data,
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
    if (!isRouteFile) return
    if (routePath === activePath) return
    setActivePath(routePath)
  }, [activePath, isRouteFile, routePath, setActivePath])

  const onOpenFile = useCallback(
    (relativePath: string) => {
      const currentTabs = tabsRef.current
      const nextTabs = currentTabs.includes(relativePath)
        ? currentTabs
        : [...currentTabs, relativePath]
      if (nextTabs !== currentTabs) {
        setTabs(nextTabs)
      }
      if (activePathRef.current !== relativePath) {
        setActivePath(relativePath)
      }
      setInspectedPath(relativePath)
      const nextRoute = pathToRoute(relativePath)
      if (locationPathnameRef.current !== nextRoute) {
        navigate(nextRoute)
      }
    },
    [activePathRef, locationPathnameRef, navigate, setActivePath, setTabs, tabsRef],
  )

  const onCloseTab = useCallback(
    (relativePath: string) => {
      const currentTabs = tabsRef.current
      const nextTabs = currentTabs.filter((tab) => tab !== relativePath)
      setTabs(nextTabs)
      if (inspectedPathRef.current === relativePath) {
        setInspectedPath(nextTabs[0] ?? null)
      }
      if (currentPathRef.current === relativePath) {
        const nextActive = nextTabs[0] ?? null
        setActivePath(nextActive)
        if (nextActive) {
          const nextRoute = pathToRoute(nextActive)
          if (locationPathnameRef.current !== nextRoute) {
            navigate(nextRoute)
          }
        } else {
          if (locationPathnameRef.current !== '/') {
            navigate('/')
          }
        }
      }
    },
    [
      currentPathRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      setActivePath,
      setTabs,
      tabsRef,
    ],
  )

  const fileTree = useMemo(() => buildFileTree(entries), [entries])
  const workspaceIndex = useWorkspaceIndex(
    entries,
    entries.some((entry) => entry.kind === 'file'),
  )
  const graph = useGraphData(
    entries,
    fileContents,
    viewMode === 'graph',
    workspaceIndex,
    currentPath,
    rootKind,
  )

  return {
    rootPath,
    rootKind,
    recentProjects,
    files: entries,
    fileContents,
    tabs,
    dirtyPaths,
    saveStates,
    activePath: currentPath,
    sidebarCollapsed,
    rightSidebarCollapsed,
    theme,
    silentSave,
    showEditorStatusBar,
    viewMode,
    fileTree,
    graph,
    workspaceIndex,
    inspectedPath: inspectedPath ?? currentPath,
    editorValue,
    isMaximized,
    setIsMaximized,
    onEditorChange,
    onOpenFile,
    onCloseTab,
    onSelectProject: onSelectFolder,
    onSelectSingleFile,
    onOpenProject: openFolder,
    onUseInternalRoot,
    createFile,
    createFolder,
    renamePath,
    deletePath,
    onRefresh: loadWorkspace,
    onInspectPath: setInspectedPath,
    setTheme,
    setViewMode,
    toggleSidebar,
    toggleRightSidebar,
  }
}
