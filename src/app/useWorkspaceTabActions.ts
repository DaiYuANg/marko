import { startTransition, useCallback, type Dispatch, type SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import {
  pathToGraphFileRoute,
  pathToGitDiffRoute,
  pathToRoute,
  pathToSourceRoute,
  pathToWorkspaceGraphRoute,
} from '@/logic/routing'
import {
  createFileTab,
  createGitDiffTab,
  fileTabId,
  getWorkspaceTabId,
  gitDiffTabId,
} from '@/logic/tabs'
import type { GitDiffSection, ViewMode, WorkspaceTab } from '@/store/useAppStore'

type LatestRef<T> = {
  readonly current: T
}

type UseWorkspaceTabActionsArgs = {
  activeTabIdRef: LatestRef<string | null>
  currentFilePathRef: LatestRef<string | null>
  inspectedPathRef: LatestRef<string | null>
  locationPathnameRef: LatestRef<string>
  rootKindRef: LatestRef<'internal' | 'external' | 'single'>
  tabsRef: LatestRef<WorkspaceTab[]>
  navigate: NavigateFunction
  setTabViewModes: Dispatch<SetStateAction<Record<string, ViewMode>>>
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setInspectedPath: (path: string | null) => void
}

export function useWorkspaceTabActions({
  activeTabIdRef,
  currentFilePathRef,
  inspectedPathRef,
  locationPathnameRef,
  rootKindRef,
  tabsRef,
  navigate,
  setTabViewModes,
  setTabs,
  setActiveTabId,
  setInspectedPath,
}: UseWorkspaceTabActionsArgs) {
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
      navigateIfNeeded(locationPathnameRef.current, nextRoute, navigate)
    },
    [
      activeTabIdRef,
      currentFilePathRef,
      locationPathnameRef,
      navigate,
      rootKindRef,
      setTabViewModes,
      tabsRef,
    ],
  )

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
      navigateIfNeeded(locationPathnameRef.current, pathToRoute(relativePath), navigate)
    },
    [
      activeTabIdRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      setActiveTabId,
      setInspectedPath,
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
      navigateIfNeeded(locationPathnameRef.current, pathToGitDiffRoute(section, path), navigate)
    },
    [
      activeTabIdRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      setActiveTabId,
      setInspectedPath,
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
      if (activeTabIdRef.current !== tabId) return

      const nextActive = nextTabs[Math.max(0, closedIndex - 1)] ?? nextTabs[0] ?? null
      const nextActiveId = nextActive ? getWorkspaceTabId(nextActive) : null
      setActiveTabId(nextActiveId)
      navigateToTab(nextActive, locationPathnameRef.current, navigate)
    },
    [
      activeTabIdRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      setActiveTabId,
      setInspectedPath,
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
      navigateIfNeeded(
        locationPathnameRef.current,
        pathToGitDiffRoute(tab.section, tab.path),
        navigate,
      )
    },
    [
      activeTabIdRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      onOpenFile,
      setActiveTabId,
      setInspectedPath,
      tabsRef,
    ],
  )

  const onCloseActiveTab = useCallback(() => {
    const currentActiveTabId = activeTabIdRef.current
    if (currentActiveTabId) onCloseTab(currentActiveTabId)
  }, [activeTabIdRef, onCloseTab])

  return {
    setViewMode,
    onOpenFile,
    onOpenGitDiff,
    onOpenTab,
    onCloseTab,
    onCloseActiveTab,
  }
}

function navigateIfNeeded(currentPathname: string, nextRoute: string, navigate: NavigateFunction) {
  if (currentPathname === nextRoute) return
  startTransition(() => {
    navigate(nextRoute)
  })
}

function navigateToTab(
  tab: WorkspaceTab | null,
  currentPathname: string,
  navigate: NavigateFunction,
) {
  if (tab?.kind === 'file') {
    navigateIfNeeded(currentPathname, pathToRoute(tab.path), navigate)
    return
  }
  if (tab?.kind === 'git-diff') {
    navigateIfNeeded(currentPathname, pathToGitDiffRoute(tab.section, tab.path), navigate)
    return
  }
  navigateIfNeeded(currentPathname, '/', navigate)
}
