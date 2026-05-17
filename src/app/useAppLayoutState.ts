import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLatest } from 'ahooks'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { GitDiffSection, ViewMode } from '@/store/useAppStore'
import { buildFileTree } from '@/logic/fileTree'
import { pathToGitDiffRoute, pathToRoute, routeToGitDiff, routeToPath } from '@/logic/routing'
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
import {
  createFileTab,
  createGitDiffTab,
  fileTabId,
  getWorkspaceTabId,
  getWorkspaceTabPath,
  gitDiffTabId,
} from '@/logic/tabs'

const EMPTY_GRAPH_LAYOUT_POSITIONS: Record<string, { x: number; y: number }> = {}

export function useAppLayoutState() {
  const {
    rootPath,
    rootKind,
    recentProjects,
    entries,
    tabs,
    activeTabId,
    setRootPath,
    setRootKind,
    setEntries,
    setTabs,
    setActiveTabId,
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
  const lastHandledRouteRef = useRef<string | null>(null)

  const routeSegment = params['*']
  const routeGitDiff = useMemo(() => routeToGitDiff(location.pathname), [location.pathname])
  const routePath = useMemo(() => routeToPath(routeSegment), [routeSegment])
  const isRouteFile = useMemo(
    () =>
      !routeGitDiff &&
      routePath !== null &&
      entries.some((entry) => entry.kind === 'file' && entry.path === routePath),
    [entries, routeGitDiff, routePath],
  )
  const activeTab = useMemo(
    () => tabs.find((tab) => getWorkspaceTabId(tab) === activeTabId) ?? null,
    [activeTabId, tabs],
  )
  const activeFilePath = activeTab?.kind === 'file' ? activeTab.path : null
  const activeResourcePath = getWorkspaceTabPath(activeTab)
  const activeTabIdRef = useLatest(activeTabId)
  const inspectedPathRef = useLatest(inspectedPath)
  const locationPathnameRef = useLatest(location.pathname)
  const tabsRef = useLatest(tabs)
  const viewMode: ViewMode = activeFilePath
    ? (tabViewModes[activeFilePath] ?? 'wysiwyg')
    : 'wysiwyg'
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      const tab = tabsRef.current.find((item) => getWorkspaceTabId(item) === activeTabIdRef.current)
      const path = tab?.kind === 'file' ? tab.path : null
      if (!path) return
      setTabViewModes((prev) => (prev[path] === mode ? prev : { ...prev, [path]: mode }))
    },
    [activeTabIdRef, tabsRef],
  )

  const workspaceKey = `${rootKind}:${rootPath}`
  const { fileContents, editorValue, dirtyPaths, saveStates, onEditorChange } = useEditorBuffer({
    activePath: activeFilePath,
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
    activeTabId,
    locationPathname: location.pathname,
    navigate,
    setEntries,
    setRootPath,
    setRootKind,
    setTabs,
    setActiveTabId,
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
    if (!routeGitDiff) return
    if (lastHandledRouteRef.current === location.pathname) return
    lastHandledRouteRef.current = location.pathname

    const id = gitDiffTabId(routeGitDiff.section, routeGitDiff.path)
    const currentTabs = tabsRef.current
    if (!currentTabs.some((tab) => getWorkspaceTabId(tab) === id)) {
      setTabs([...currentTabs, createGitDiffTab(routeGitDiff.path, routeGitDiff.section)])
    }
    setActiveTabId(id)
    if (inspectedPathRef.current !== routeGitDiff.path) {
      setInspectedPath(routeGitDiff.path)
    }
  }, [inspectedPathRef, location.pathname, routeGitDiff, setActiveTabId, setTabs, tabsRef])

  useEffect(() => {
    if (!isRouteFile) return
    if (!routePath) return
    if (lastHandledRouteRef.current === location.pathname) return
    lastHandledRouteRef.current = location.pathname

    const id = fileTabId(routePath)
    const currentTabs = tabsRef.current
    if (!currentTabs.some((tab) => getWorkspaceTabId(tab) === id)) {
      setTabs([...currentTabs, createFileTab(routePath)])
    }
    setActiveTabId(id)
  }, [isRouteFile, location.pathname, routePath, setActiveTabId, setTabs, tabsRef])

  const onOpenFile = useCallback(
    (relativePath: string) => {
      const currentTabs = tabsRef.current
      const id = fileTabId(relativePath)
      const nextTabs = currentTabs.some((tab) => getWorkspaceTabId(tab) === id)
        ? currentTabs
        : [...currentTabs, createFileTab(relativePath)]
      if (nextTabs !== currentTabs) {
        setTabs(nextTabs)
      }
      if (activeTabIdRef.current !== id) {
        setActiveTabId(id)
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
      activeTabIdRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      setActiveTabId,
      setTabs,
      tabsRef,
    ],
  )

  const onOpenGitDiff = useCallback(
    (path: string, section: GitDiffSection) => {
      const currentTabs = tabsRef.current
      const id = gitDiffTabId(section, path)
      const nextTabs = currentTabs.some((tab) => getWorkspaceTabId(tab) === id)
        ? currentTabs
        : [...currentTabs, createGitDiffTab(path, section)]
      if (nextTabs !== currentTabs) {
        setTabs(nextTabs)
      }
      if (activeTabIdRef.current !== id) {
        setActiveTabId(id)
      }
      if (inspectedPathRef.current !== path) {
        setInspectedPath(path)
      }
      const nextRoute = pathToGitDiffRoute(section, path)
      if (locationPathnameRef.current !== nextRoute) {
        startTransition(() => {
          navigate(nextRoute)
        })
      }
    },
    [
      activeTabIdRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      setActiveTabId,
      setTabs,
      tabsRef,
    ],
  )

  const onCloseTab = useCallback(
    (tabId: string) => {
      const currentTabs = tabsRef.current
      const closedIndex = currentTabs.findIndex((tab) => getWorkspaceTabId(tab) === tabId)
      const closedTab = currentTabs.find((tab) => getWorkspaceTabId(tab) === tabId)
      const nextTabs = currentTabs.filter((tab) => getWorkspaceTabId(tab) !== tabId)
      setTabs(nextTabs)
      if (closedTab && inspectedPathRef.current === closedTab.path) {
        setInspectedPath(nextTabs[0]?.path ?? null)
      }
      if (activeTabIdRef.current === tabId) {
        const nextActive = nextTabs[Math.max(0, closedIndex - 1)] ?? nextTabs[0] ?? null
        const nextActiveId = nextActive ? getWorkspaceTabId(nextActive) : null
        setActiveTabId(nextActiveId)
        if (nextActive?.kind === 'file') {
          const nextRoute = pathToRoute(nextActive.path)
          if (locationPathnameRef.current !== nextRoute) {
            startTransition(() => {
              navigate(nextRoute)
            })
          }
        } else if (nextActive?.kind === 'git-diff') {
          const nextRoute = pathToGitDiffRoute(nextActive.section, nextActive.path)
          if (locationPathnameRef.current !== nextRoute) {
            startTransition(() => {
              navigate(nextRoute)
            })
          }
        } else {
          if (!nextActive && locationPathnameRef.current !== '/') {
            startTransition(() => {
              navigate('/')
            })
          }
        }
      }
    },
    [
      activeTabIdRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      setActiveTabId,
      setTabs,
      tabsRef,
    ],
  )

  const onOpenTab = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find((item) => getWorkspaceTabId(item) === tabId)
      if (!tab) return
      if (tab.kind === 'file') {
        onOpenFile(tab.path)
        return
      }
      if (activeTabIdRef.current !== tabId) {
        setActiveTabId(tabId)
      }
      if (inspectedPathRef.current !== tab.path) {
        setInspectedPath(tab.path)
      }
      const nextRoute = pathToGitDiffRoute(tab.section, tab.path)
      if (locationPathnameRef.current !== nextRoute) {
        startTransition(() => {
          navigate(nextRoute)
        })
      }
    },
    [
      activeTabIdRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      onOpenFile,
      setActiveTabId,
      tabsRef,
    ],
  )

  const onCloseActiveTab = useCallback(() => {
    const currentActiveTabId = activeTabIdRef.current
    if (currentActiveTabId) onCloseTab(currentActiveTabId)
  }, [activeTabIdRef, onCloseTab])

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
    activeFilePath,
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
    activeTab,
    activeTabId,
    dirtyPaths,
    saveStates,
    activePath: activeFilePath,
    activeResourcePath,
    sidebarCollapsed,
    rightSidebarCollapsed,
    theme,
    silentSave,
    showEditorStatusBar,
    viewMode,
    fileTree,
    graph,
    workspaceIndex,
    inspectedPath: inspectedPath ?? activeResourcePath,
    graphLayoutPositions,
    editorValue,
    isMaximized,
    setIsMaximized,
    onEditorChange,
    onOpenFile,
    onOpenGitDiff,
    onOpenTab,
    onCloseTab,
    onCloseActiveTab,
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
