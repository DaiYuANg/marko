import { useEffect } from 'react'
import { isGitDiffSection } from '@/logic/routing'
import {
  createFileTab,
  createGitDiffTab,
  fileTabId,
  getWorkspaceTabId,
  gitDiffTabId,
} from '@/logic/tabs'
import type { GitDiffSection, WorkspaceTab } from '@/store/useAppStore'

type LatestRef<T> = {
  current: T
}

type UseRouteTabSyncArgs = {
  gitDiffMatch: unknown
  sourceMatch: unknown
  graphFileMatch: unknown
  graphWorkspaceMatch: unknown
  gitDiffSection: string | undefined
  gitDiffPath: string | null
  routeFilePath: string | null
  routePath: string | null
  isRouteFile: boolean
  locationPathname: string
  lastHandledRouteRef: LatestRef<string | null>
  inspectedPathRef: LatestRef<string | null>
  tabsRef: LatestRef<WorkspaceTab[]>
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setInspectedPath: (path: string | null) => void
}

export function useRouteTabSync({
  gitDiffMatch,
  sourceMatch,
  graphFileMatch,
  graphWorkspaceMatch,
  gitDiffSection,
  gitDiffPath,
  routeFilePath,
  routePath,
  isRouteFile,
  locationPathname,
  lastHandledRouteRef,
  inspectedPathRef,
  tabsRef,
  setTabs,
  setActiveTabId,
  setInspectedPath,
}: UseRouteTabSyncArgs) {
  useEffect(() => {
    if (!gitDiffMatch) return
    if (!isGitDiffSection(gitDiffSection) || !gitDiffPath) return
    if (lastHandledRouteRef.current === locationPathname) return
    lastHandledRouteRef.current = locationPathname

    openRouteGitDiff({
      path: gitDiffPath,
      section: gitDiffSection,
      inspectedPathRef,
      tabsRef,
      setTabs,
      setActiveTabId,
      setInspectedPath,
    })
  }, [
    gitDiffMatch,
    gitDiffPath,
    gitDiffSection,
    inspectedPathRef,
    lastHandledRouteRef,
    locationPathname,
    setActiveTabId,
    setInspectedPath,
    setTabs,
    tabsRef,
  ])

  useEffect(() => {
    if (!sourceMatch && !graphFileMatch && !graphWorkspaceMatch) return
    if (lastHandledRouteRef.current === locationPathname) return
    lastHandledRouteRef.current = locationPathname

    if (graphWorkspaceMatch) return
    if (!routeFilePath) return

    openRouteFile({
      path: routeFilePath,
      inspect: true,
      inspectedPathRef,
      tabsRef,
      setTabs,
      setActiveTabId,
      setInspectedPath,
    })
  }, [
    graphFileMatch,
    graphWorkspaceMatch,
    inspectedPathRef,
    lastHandledRouteRef,
    locationPathname,
    routeFilePath,
    setActiveTabId,
    setInspectedPath,
    setTabs,
    sourceMatch,
    tabsRef,
  ])

  useEffect(() => {
    if (!isRouteFile) return
    if (!routePath) return
    if (lastHandledRouteRef.current === locationPathname) return
    lastHandledRouteRef.current = locationPathname

    openRouteFile({
      path: routePath,
      inspect: false,
      inspectedPathRef,
      tabsRef,
      setTabs,
      setActiveTabId,
      setInspectedPath,
    })
  }, [
    inspectedPathRef,
    isRouteFile,
    lastHandledRouteRef,
    locationPathname,
    routePath,
    setActiveTabId,
    setInspectedPath,
    setTabs,
    tabsRef,
  ])
}

type OpenRouteFileArgs = {
  path: string
  inspect: boolean
  inspectedPathRef: LatestRef<string | null>
  tabsRef: LatestRef<WorkspaceTab[]>
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setInspectedPath: (path: string | null) => void
}

function openRouteFile({
  path,
  inspect,
  inspectedPathRef,
  tabsRef,
  setTabs,
  setActiveTabId,
  setInspectedPath,
}: OpenRouteFileArgs) {
  const id = fileTabId(path)
  const currentTabs = tabsRef.current
  if (!currentTabs.some((tab) => getWorkspaceTabId(tab) === id)) {
    setTabs([...currentTabs, createFileTab(path)])
  }
  setActiveTabId(id)
  if (inspect && inspectedPathRef.current !== path) {
    setInspectedPath(path)
  }
}

type OpenRouteGitDiffArgs = {
  path: string
  section: GitDiffSection
  inspectedPathRef: LatestRef<string | null>
  tabsRef: LatestRef<WorkspaceTab[]>
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setInspectedPath: (path: string | null) => void
}

function openRouteGitDiff({
  path,
  section,
  inspectedPathRef,
  tabsRef,
  setTabs,
  setActiveTabId,
  setInspectedPath,
}: OpenRouteGitDiffArgs) {
  const id = gitDiffTabId(section, path)
  const currentTabs = tabsRef.current
  if (!currentTabs.some((tab) => getWorkspaceTabId(tab) === id)) {
    setTabs([...currentTabs, createGitDiffTab(path, section)])
  }
  setActiveTabId(id)
  if (inspectedPathRef.current !== path) {
    setInspectedPath(path)
  }
}
