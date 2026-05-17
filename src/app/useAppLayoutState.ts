import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import { useLatest } from 'ahooks'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { ViewMode } from '@/store/useAppStore'
import { buildFileTree } from '@/logic/fileTree'
import { pathToRoute, routeToPath } from '@/logic/routing'
import { useProjectLoader } from '@/app/useProjectLoader'
import { useEditorBuffer } from '@/app/useEditorBuffer'
import { useGraphData } from '@/app/useGraphData'
import { fsSnapshotSchema } from '@/services/fsApi'
import { useWorkspaceIndex } from '@/app/useWorkspaceIndex'
import {
  useGraphLayoutStoreSlice,
  useLayoutStoreSlice,
  useWorkspaceStoreSlice,
} from '@/store/selectors'

const EMPTY_GRAPH_LAYOUT_POSITIONS: Record<string, { x: number; y: number }> = {}

export function useAppLayoutState() {
  const {
    rootPath,
    rootKind,
    recentProjects,
    entries,
    tabs,
    activePath,
    setRootPath,
    setRootKind,
    setEntries,
    setTabs,
    setActivePath,
    touchRecentProject,
  } = useWorkspaceStoreSlice()
  const {
    sidebarCollapsed,
    rightSidebarCollapsed,
    theme,
    silentSave,
    showEditorStatusBar,
    toggleSidebar,
    toggleRightSidebar,
    setTheme,
  } = useLayoutStoreSlice()
  const { graphLayouts, setGraphNodePosition } = useGraphLayoutStoreSlice()

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
      setTabViewModes((prev) => (prev[path] === mode ? prev : { ...prev, [path]: mode }))
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
      if (inspectedPathRef.current !== relativePath) {
        setInspectedPath(relativePath)
      }
      const nextRoute = pathToRoute(relativePath)
      if (locationPathnameRef.current !== nextRoute) {
        startTransition(() => {
          navigate(nextRoute)
        })
      }
    },
    [
      activePathRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      setActivePath,
      setTabs,
      tabsRef,
    ],
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
            startTransition(() => {
              navigate(nextRoute)
            })
          }
        } else {
          if (locationPathnameRef.current !== '/') {
            startTransition(() => {
              navigate('/')
            })
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
  const graphLayoutPositions = useMemo(
    () =>
      graph.layoutKey
        ? (graphLayouts[graph.layoutKey] ?? EMPTY_GRAPH_LAYOUT_POSITIONS)
        : EMPTY_GRAPH_LAYOUT_POSITIONS,
    [graph.layoutKey, graphLayouts],
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
    graphLayoutPositions,
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
    setGraphNodePosition,
    toggleSidebar,
    toggleRightSidebar,
  }
}
