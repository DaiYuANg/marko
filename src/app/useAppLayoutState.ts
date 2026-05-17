import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLatest } from 'ahooks'
import { useLocation, useMatch, useNavigate, useParams } from 'react-router-dom'
import type { GitDiffSection, ViewMode } from '@/store/useAppStore'
import { buildFileTree } from '@/logic/fileTree'
import {
  GIT_DIFF_ROUTE_PATTERN,
  GRAPH_FILE_ROUTE_PATTERN,
  GRAPH_WORKSPACE_ROUTE_PATTERN,
  SOURCE_ROUTE_PATTERN,
  pathToGraphFileRoute,
  pathToGitDiffRoute,
  pathToRoute,
  pathToSourceRoute,
  pathToWorkspaceGraphRoute,
  isGitDiffSection,
} from '@/logic/routing'
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
  const gitDiffMatch = useMatch(GIT_DIFF_ROUTE_PATTERN)
  const sourceMatch = useMatch(SOURCE_ROUTE_PATTERN)
  const graphFileMatch = useMatch(GRAPH_FILE_ROUTE_PATTERN)
  const graphWorkspaceMatch = useMatch(GRAPH_WORKSPACE_ROUTE_PATTERN)
  const lastHandledRouteRef = useRef<string | null>(null)

  const routeSegment = params['*']
  const gitDiffSection = gitDiffMatch?.params.section
  const gitDiffPath = gitDiffMatch?.params['*'] || null
  const sourcePath = sourceMatch?.params['*'] || null
  const graphFilePath = graphFileMatch?.params['*'] || null
  const routePath = routeSegment || null
  const routeFilePath = sourcePath ?? graphFilePath
  const internalRouteActive = Boolean(
    gitDiffMatch || sourceMatch || graphFileMatch || graphWorkspaceMatch,
  )
  const isRouteFile = useMemo(
    () =>
      !internalRouteActive &&
      routePath !== null &&
      entries.some((entry) => entry.kind === 'file' && entry.path === routePath),
    [entries, internalRouteActive, routePath],
  )
  const activeTab = useMemo(
    () => tabs.find((tab) => getWorkspaceTabId(tab) === activeTabId) ?? null,
    [activeTabId, tabs],
  )
  const activeFilePath = activeTab?.kind === 'file' ? activeTab.path : null
  const currentFilePath = graphWorkspaceMatch ? null : (routeFilePath ?? activeFilePath)
  const activeResourcePath = graphWorkspaceMatch
    ? getWorkspaceTabPath(activeTab)
    : (routeFilePath ?? getWorkspaceTabPath(activeTab))
  const activeTabIdRef = useLatest(activeTabId)
  const currentFilePathRef = useLatest(currentFilePath)
  const inspectedPathRef = useLatest(inspectedPath)
  const locationPathnameRef = useLatest(location.pathname)
  const rootKindRef = useLatest(rootKind)
  const tabsRef = useLatest(tabs)
  const viewMode: ViewMode = sourceMatch
    ? 'source'
    : graphFileMatch || graphWorkspaceMatch
      ? 'graph'
      : currentFilePath
        ? (tabViewModes[currentFilePath] ?? 'wysiwyg')
        : 'wysiwyg'
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      const tab = tabsRef.current.find((item) => getWorkspaceTabId(item) === activeTabIdRef.current)
      const path = currentFilePathRef.current ?? (tab?.kind === 'file' ? tab.path : null)
      if (!path && mode !== 'graph') return
      if (path) {
        setTabViewModes((prev) => (prev[path] === mode ? prev : { ...prev, [path]: mode }))
      }

      const nextRoute =
        mode === 'source' && path
          ? pathToSourceRoute(path)
          : mode === 'graph'
            ? rootKindRef.current === 'single' && path
              ? pathToGraphFileRoute(path)
              : pathToWorkspaceGraphRoute()
            : path
              ? pathToRoute(path)
              : '/'
      if (locationPathnameRef.current !== nextRoute) {
        startTransition(() => {
          navigate(nextRoute)
        })
      }
    },
    [activeTabIdRef, currentFilePathRef, locationPathnameRef, navigate, rootKindRef, tabsRef],
  )

  const workspaceKey = `${rootKind}:${rootPath}`
  const { fileContents, editorValue, dirtyPaths, saveStates, onEditorChange } = useEditorBuffer({
    activePath: currentFilePath,
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
    preserveCurrentRoute: internalRouteActive,
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
    if (!gitDiffMatch) return
    if (!isGitDiffSection(gitDiffSection) || !gitDiffPath) return
    if (lastHandledRouteRef.current === location.pathname) return
    lastHandledRouteRef.current = location.pathname

    const id = gitDiffTabId(gitDiffSection, gitDiffPath)
    const currentTabs = tabsRef.current
    if (!currentTabs.some((tab) => getWorkspaceTabId(tab) === id)) {
      setTabs([...currentTabs, createGitDiffTab(gitDiffPath, gitDiffSection)])
    }
    setActiveTabId(id)
    if (inspectedPathRef.current !== gitDiffPath) {
      setInspectedPath(gitDiffPath)
    }
  }, [
    gitDiffMatch,
    gitDiffPath,
    gitDiffSection,
    inspectedPathRef,
    location.pathname,
    setActiveTabId,
    setTabs,
    tabsRef,
  ])

  useEffect(() => {
    if (!sourceMatch && !graphFileMatch && !graphWorkspaceMatch) return
    if (lastHandledRouteRef.current === location.pathname) return
    lastHandledRouteRef.current = location.pathname

    if (graphWorkspaceMatch) {
      return
    }

    if (!routeFilePath) return

    const id = fileTabId(routeFilePath)
    const currentTabs = tabsRef.current
    if (!currentTabs.some((tab) => getWorkspaceTabId(tab) === id)) {
      setTabs([...currentTabs, createFileTab(routeFilePath)])
    }
    setActiveTabId(id)
    if (inspectedPathRef.current !== routeFilePath) {
      setInspectedPath(routeFilePath)
    }
  }, [
    graphFileMatch,
    graphWorkspaceMatch,
    inspectedPathRef,
    location.pathname,
    routeFilePath,
    setActiveTabId,
    setTabs,
    sourceMatch,
    tabsRef,
  ])

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
    currentFilePath,
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
    activePath: currentFilePath,
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
